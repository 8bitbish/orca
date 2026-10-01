import type {
  TerminalMessageQueueLead,
  TerminalMessageQueueSnapshot,
  TerminalMessageQueueTerminalVerdict,
  TerminalQueuedMessage
} from '../../shared/terminal-message-queue-contract'

/** Host-side record; `attempts` and the lease deadline never leave the host. */
export type QueuedItemRecord = {
  id: string
  text: string
  imagePaths?: string[]
  queuedAt: number
  editedAt?: number
  state: TerminalQueuedMessage['state']
  undeliverableReason?: TerminalQueuedMessage['undeliverableReason']
  editLeaseUntil?: number
  attempts: number
}

/** A delivery that fails this many times is handed back to the user instead of retried forever. */
export const MAX_DELIVERY_ATTEMPTS = 3
/** How long an open editor holds the queue without renewing. */
export const QUEUED_ITEM_EDIT_LEASE_MS = 120_000

export function createQueuedItem(args: {
  id: string
  text: string
  imagePaths?: readonly string[]
  now: number
}): QueuedItemRecord {
  return {
    id: args.id,
    text: args.text,
    ...(args.imagePaths && args.imagePaths.length > 0 ? { imagePaths: [...args.imagePaths] } : {}),
    queuedAt: args.now,
    state: 'queued',
    attempts: 0
  }
}

export function isEditLeaseHeld(item: QueuedItemRecord, now: number): boolean {
  return item.editLeaseUntil !== undefined && item.editLeaseUntil > now
}

export function toWireItem(item: QueuedItemRecord, now: number): TerminalQueuedMessage {
  return {
    id: item.id,
    text: item.text,
    ...(item.imagePaths ? { imagePaths: [...item.imagePaths] } : {}),
    queuedAt: item.queuedAt,
    ...(item.editedAt !== undefined ? { editedAt: item.editedAt } : {}),
    state: item.state,
    ...(item.undeliverableReason ? { undeliverableReason: item.undeliverableReason } : {}),
    ...(isEditLeaseHeld(item, now) ? { editing: true } : {})
  }
}

export function buildQueueSnapshot(args: {
  revision: number
  lead: TerminalMessageQueueLead
  interrupting: boolean
  terminal: TerminalMessageQueueTerminalVerdict
  items: readonly QueuedItemRecord[]
  now: number
}): TerminalMessageQueueSnapshot {
  return {
    revision: args.revision,
    lead: args.lead,
    interrupting: args.interrupting,
    terminal: args.terminal,
    items: args.items.map((item) => toWireItem(item, args.now))
  }
}

/** The item delivery would send next: the oldest still-queued one, in order. */
export function queueHead(items: readonly QueuedItemRecord[]): QueuedItemRecord | null {
  return items.find((item) => item.state !== 'undeliverable') ?? null
}

export function hasSendableContent(text: string, imagePaths?: readonly string[]): boolean {
  return text.trim() !== '' || (imagePaths?.length ?? 0) > 0
}

/** Applies a client edit to a queued item; `emptied` means the caller should remove it. */
export function applyQueuedItemEdit(
  item: QueuedItemRecord,
  change: { text?: string; editing?: boolean },
  now: number
): 'edited' | 'held' | 'released' | 'emptied' {
  if (change.text !== undefined) {
    item.editLeaseUntil = undefined
    if (!hasSendableContent(change.text, item.imagePaths)) {
      return 'emptied'
    }
    item.text = change.text
    item.editedAt = now
    return 'edited'
  }
  if (change.editing === true) {
    item.editLeaseUntil = now + QUEUED_ITEM_EDIT_LEASE_MS
    return 'held'
  }
  item.editLeaseUntil = undefined
  return 'released'
}

export function markUndeliverable(
  items: readonly QueuedItemRecord[],
  reason: NonNullable<QueuedItemRecord['undeliverableReason']>
): void {
  for (const item of items) {
    item.state = 'undeliverable'
    item.undeliverableReason = reason
    item.editLeaseUntil = undefined
  }
}
