import {
  TERMINAL_MESSAGE_QUEUE_MAX_ITEMS,
  type TerminalMessageQueueEditResult,
  type TerminalMessageQueueSendNextResult,
  type TerminalMessageQueueStopResult,
  type TerminalMessageQueueSubmitResult
} from '../../shared/terminal-message-queue-contract'
import {
  applyQueuedItemEdit,
  createQueuedItem,
  markUndeliverable,
  isEditLeaseHeld,
  MAX_DELIVERY_ATTEMPTS,
  QUEUED_ITEM_EDIT_LEASE_MS,
  queueHead,
  toWireItem,
  type QueuedItemRecord
} from './terminal-message-queue-items'
import {
  TerminalMessageQueueCore,
  type TerminalMessageQueueDeliveryOutcome
} from './terminal-message-queue-core'

export type {
  TerminalMessageQueueDeliveryOutcome,
  TerminalMessageQueueDeps
} from './terminal-message-queue-core'

export const TERMINAL_MESSAGE_QUEUE_TIMINGS = {
  /** After a turn ends, before typing, so the TUI is back at its prompt. */
  settleMs: 350,
  /** Retry after a refused or blocked delivery. */
  retryMs: 3_000,
  editLeaseMs: QUEUED_ITEM_EDIT_LEASE_MS
}

export class TerminalMessageQueue extends TerminalMessageQueueCore {
  submit(input: {
    text: string
    imagePaths?: readonly string[]
  }): TerminalMessageQueueSubmitResult {
    if (this.terminal === 'exited') {
      return { disposition: 'refused', reason: 'terminal-exited' }
    }
    if (this.items.length >= TERMINAL_MESSAGE_QUEUE_MAX_ITEMS) {
      return { disposition: 'refused', reason: 'queue-full' }
    }
    this.observeStatus()
    const lead = this.turns.lead()
    // Why: an idle agent with nothing waiting takes the client's own send, exactly as before.
    if (this.items.length === 0 && !this.stopping && (lead === 'idle' || lead === 'unknown')) {
      return { disposition: 'direct', snapshot: this.snapshot() }
    }
    const item = createQueuedItem({
      id: this.deps.newId(),
      ...input,
      now: this.deps.now()
    })
    this.items.push(item)
    this.changed()
    this.schedulePump(0)
    return {
      disposition: 'queued',
      item: toWireItem(item, this.deps.now()),
      snapshot: this.snapshot()
    }
  }

  remove(itemId: string): boolean {
    const item = this.items.find((candidate) => candidate.id === itemId)
    // Why: a delivering item is already being typed; removing it now cannot unsend it.
    if (!item || item.state === 'delivering') {
      return false
    }
    this.items = this.items.filter((candidate) => candidate !== item)
    this.emit({ type: 'removed', itemId })
    this.changed()
    this.schedulePump(0)
    return true
  }

  edit(
    itemId: string,
    change: { text?: string; editing?: boolean }
  ): TerminalMessageQueueEditResult {
    const item = this.items.find((candidate) => candidate.id === itemId)
    if (!item) {
      return { outcome: 'not-found', snapshot: this.snapshot() }
    }
    if (item.state !== 'queued') {
      return { outcome: 'not-queued', snapshot: this.snapshot() }
    }
    const outcome = applyQueuedItemEdit(item, change, this.deps.now())
    if (outcome === 'emptied') {
      // An edit that empties the message is a removal.
      this.remove(itemId)
      return { outcome: 'edited', snapshot: this.snapshot() }
    }
    this.changed()
    this.schedulePump(0)
    return { outcome, snapshot: this.snapshot() }
  }

  /** Re-reads the host's status rows; called on every change to this pane's row. */
  noteStatusChanged(): void {
    if (this.terminal === 'unverifiable') {
      // A fresh status row is the agent itself reporting, so the terminal is reachable again.
      this.terminal = 'live'
      this.changed()
    }
    this.observeStatus()
    this.schedulePump(0)
  }

  /** A provider-authored interrupt marker in the transcript: the current turn is over. */
  noteTranscriptTurnEnded(): void {
    this.turns.endCurrentTurn()
    this.observeStatus()
    this.schedulePump(0)
  }

  noteTerminalExit(verdict: 'exited' | 'unverifiable'): void {
    if (this.terminal === 'exited') {
      return
    }
    this.terminal = verdict
    if (verdict === 'exited') {
      this.cancelPump()
      markUndeliverable(this.items, 'exited')
      this.turns.cancelWait()
    }
    this.changed()
  }

  /** Stop: interrupt the running turn, wait for the host to see it end, then send the next item. */
  stop(): Promise<TerminalMessageQueueStopResult> {
    this.stopping ??= this.runStop().finally(() => {
      this.stopping = null
      this.changed()
      this.schedulePump(0)
    })
    return this.stopping
  }

  /** The user's override when the host cannot see the turn end: treat it as over and send now. */
  sendNext(): TerminalMessageQueueSendNextResult {
    if (this.terminal === 'exited') {
      return { outcome: 'exited', snapshot: this.snapshot() }
    }
    if (!queueHead(this.items)) {
      return { outcome: 'empty', snapshot: this.snapshot() }
    }
    this.turns.endCurrentTurn()
    this.observeStatus()
    const lead = this.turns.lead()
    if (lead === 'dialog' || this.delivery || this.stopping) {
      return { outcome: 'held', snapshot: this.snapshot() }
    }
    this.schedulePump(0)
    return { outcome: 'sent', snapshot: this.snapshot() }
  }

  dispose(): void {
    this.cancelPump()
    this.turns.cancelWait()
    this.endSubscriptions()
  }

  private async runStop(): Promise<TerminalMessageQueueStopResult> {
    // Why: interrupting mid-paste would cut a delivery in half; let it land, then stop its turn.
    await this.delivery
    if (this.terminal === 'exited') {
      return { outcome: 'exited', snapshot: this.snapshot() }
    }
    this.observeStatus()
    if (!this.turns.isTurnRunning()) {
      return { outcome: 'not-working', snapshot: this.snapshot() }
    }
    this.changed()
    this.turns.beginStop()
    if (!(await this.deps.interrupt())) {
      this.turns.cancelWait()
      return { outcome: 'unverifiable', snapshot: this.snapshot() }
    }
    const ended = await this.turns.waitForStop()
    // Re-read through the getter: the terminal can exit while the wait is pending.
    if (this.terminalVerdict === 'exited') {
      return { outcome: 'exited', snapshot: this.snapshot() }
    }
    return {
      outcome: ended ? 'turn-ended' : 'unverifiable',
      snapshot: this.snapshot()
    }
  }

  protected pump(settled = false): void {
    if (this.delivery || this.stopping || this.terminal === 'exited') {
      return
    }
    const head = queueHead(this.items)
    if (!head) {
      return
    }
    const now = this.deps.now()
    if (isEditLeaseHeld(head, now)) {
      this.schedulePump((head.editLeaseUntil ?? now) - now)
      return
    }
    this.observeStatus()
    const wait = this.turns.deliveryWaitMs()
    if (wait === null) {
      return // A running turn or an open dialog; the next status change pumps again.
    }
    if (wait > 0) {
      this.schedulePump(wait)
      return
    }
    if (!settled) {
      this.cancelPump()
      this.pumpTimer = setTimeout(() => {
        this.pumpTimer = null
        this.pump(true)
      }, TERMINAL_MESSAGE_QUEUE_TIMINGS.settleMs)
      return
    }
    this.delivery = this.deliverHead(head).finally(() => {
      this.delivery = null
    })
  }

  private async deliverHead(item: QueuedItemRecord): Promise<void> {
    item.state = 'delivering'
    item.attempts += 1
    this.changed()
    const turnBefore = this.turns.currentTurnKey()
    let outcome: TerminalMessageQueueDeliveryOutcome
    try {
      outcome = await this.deps.deliver(toWireItem(item, this.deps.now()))
    } catch {
      outcome = 'failed'
    }
    if (this.terminal === 'exited') {
      return
    }
    if (outcome === 'delivered') {
      this.items = this.items.filter((candidate) => candidate !== item)
      this.turns.noteDelivered(turnBefore)
      this.emit({
        type: 'delivered',
        item: { ...toWireItem(item, this.deps.now()), state: 'queued' }
      })
      this.changed()
      this.schedulePump(0)
      return
    }
    item.state = 'queued'
    if (outcome === 'unverifiable') {
      this.terminal = 'unverifiable'
    } else if (outcome === 'failed' && item.attempts >= MAX_DELIVERY_ATTEMPTS) {
      item.state = 'undeliverable'
      item.undeliverableReason = 'failed'
    }
    this.changed()
    this.schedulePump(TERMINAL_MESSAGE_QUEUE_TIMINGS.retryMs)
  }
}
