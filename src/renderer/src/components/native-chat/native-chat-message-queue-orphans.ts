import type { TerminalQueuedMessage } from '../../../../shared/terminal-message-queue-contract'
import { setBoundedScopeCacheEntry } from './native-chat-composer-scope-cache'

/** A queued message the host can no longer send, held here so the user can restore it. */
export type NativeChatOrphanedQueuedMessage = {
  id: string
  text: string
  imagePaths?: string[]
  /** `exited`: its terminal ended. `lost`: the host stopped knowing it (restart, new terminal). */
  reason: 'exited' | 'failed' | 'lost'
}

/**
 * Items the last snapshot held that the next one lacks, and that no `delivered` or `removed` event
 * accounted for. The host keeps its queue in memory, so a restart or a replaced PTY drops items
 * silently; the client is the only one left that remembers them.
 */
export function findVanishedQueueItems(args: {
  previous: readonly TerminalQueuedMessage[]
  next: readonly TerminalQueuedMessage[]
  retiredIds: ReadonlySet<string>
}): NativeChatOrphanedQueuedMessage[] {
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
        reason: item.undeliverableReason ?? 'lost'
      }))
  )
}

const orphanCache = new Map<string, NativeChatOrphanedQueuedMessage[]>()
// Why: the chat view unmounts on a TUI toggle; the last snapshot must outlive it, or a host
// restart while it was hidden would drop queued items without a trace.
const lastKnownItemsCache = new Map<string, TerminalQueuedMessage[]>()

export function readLastKnownQueueItems(paneKey: string): TerminalQueuedMessage[] {
  return [...(lastKnownItemsCache.get(paneKey) ?? [])]
}

export function writeLastKnownQueueItems(
  paneKey: string,
  items: readonly TerminalQueuedMessage[]
): void {
  if (items.length === 0) {
    lastKnownItemsCache.delete(paneKey)
  } else {
    setBoundedScopeCacheEntry(lastKnownItemsCache, paneKey, [...items])
  }
}

export function readQueueOrphans(paneKey: string): NativeChatOrphanedQueuedMessage[] {
  return [...(orphanCache.get(paneKey) ?? [])]
}

export function writeQueueOrphans(
  paneKey: string,
  orphans: readonly NativeChatOrphanedQueuedMessage[]
): NativeChatOrphanedQueuedMessage[] {
  const unique = orphans.filter(
    (orphan, index) => orphans.findIndex((other) => other.id === orphan.id) === index
  )
  if (unique.length === 0) {
    orphanCache.delete(paneKey)
  } else {
    setBoundedScopeCacheEntry(orphanCache, paneKey, unique)
  }
  return [...unique]
}

export function clearQueueOrphansForTests(): void {
  orphanCache.clear()
  lastKnownItemsCache.clear()
}
