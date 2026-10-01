import type { NativeChatMessage } from '../../../src/shared/native-chat-types'
import type { TerminalQueuedMessage } from '../../../src/shared/terminal-message-queue-contract'
import { normalizeReconcileText, normalizedUserText } from './mobile-native-chat-draft-reconcile'

/** A queued message the host can no longer send, kept here so the user can restore it. */
export type MobileQueuedMessageOrphan = {
  id: string
  text: string
  imagePaths?: string[]
  /** `exited`: its terminal ended. `lost`: the host stopped knowing it (restart, new terminal). */
  reason: 'exited' | 'failed' | 'lost'
  /** Host clock, from the item. */
  queuedAt: number
  /** Phone clock, when this client noticed it was gone. */
  detectedAt: number
}

/**
 * Items the last snapshot held that the next one lacks, and that no `delivered` or `removed` event
 * accounted for. The host keeps its queue in memory, so a restart drops items silently. Mirrors the
 * desktop's native-chat-message-queue-orphans.ts, which the renderer owns.
 */
export function findVanishedMobileQueueItems(args: {
  previous: readonly TerminalQueuedMessage[]
  next: readonly TerminalQueuedMessage[]
  retiredIds: ReadonlySet<string>
  now: number
}): MobileQueuedMessageOrphan[] {
  const nextIds = new Set(args.next.map((item) => item.id))
  return (
    args.previous
      // A vanished `delivering` item was most likely typed already; offering it back invites a resend.
      .filter(
        (item) =>
          !nextIds.has(item.id) && !args.retiredIds.has(item.id) && item.state !== 'delivering'
      )
      .map((item) => ({
        id: item.id,
        text: item.text,
        ...(item.imagePaths ? { imagePaths: item.imagePaths } : {}),
        reason: item.undeliverableReason ?? 'lost',
        queuedAt: item.queuedAt,
        detectedAt: args.now
      }))
  )
}

// Host and transcript clocks are the same machine's; this only absorbs rounding.
const TRANSCRIPT_TIMESTAMP_SLACK_MS = 5_000

/**
 * True when the transcript shows the lost item as sent. A reconnect can drop the `delivered` event
 * the host emitted in the gap, and offering a delivered prompt back invites sending it twice.
 */
export function mobileQueueOrphanReachedTranscript(
  orphan: Pick<MobileQueuedMessageOrphan, 'text' | 'queuedAt'>,
  messages: readonly NativeChatMessage[]
): boolean {
  const text = normalizeReconcileText(orphan.text)
  return messages.some(
    (message) =>
      message.role === 'user' &&
      (message.timestamp ?? 0) >= orphan.queuedAt - TRANSCRIPT_TIMESTAMP_SLACK_MS &&
      normalizedUserText(message) === text
  )
}

const MAX_SCOPES = 32
// Why module scope: the controller re-targets on a tab switch, and a tab's lost items must still be
// there when the user comes back to it.
const orphansByScope = new Map<string, MobileQueuedMessageOrphan[]>()

export function readMobileQueueOrphans(scope: string): MobileQueuedMessageOrphan[] {
  return [...(orphansByScope.get(scope) ?? [])]
}

export function writeMobileQueueOrphans(
  scope: string,
  orphans: readonly MobileQueuedMessageOrphan[]
): MobileQueuedMessageOrphan[] {
  const unique = orphans.filter(
    (orphan, index) => orphans.findIndex((other) => other.id === orphan.id) === index
  )
  orphansByScope.delete(scope)
  if (unique.length > 0) {
    orphansByScope.set(scope, unique)
    while (orphansByScope.size > MAX_SCOPES) {
      const oldest = orphansByScope.keys().next().value
      if (oldest === undefined) {
        break
      }
      orphansByScope.delete(oldest)
    }
  }
  return [...unique]
}

export function clearMobileQueueOrphansForTests(): void {
  orphansByScope.clear()
}
