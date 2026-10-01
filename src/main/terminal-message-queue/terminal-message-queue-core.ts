import type {
  TerminalMessageQueueEvent,
  TerminalMessageQueueLead,
  TerminalMessageQueueSnapshot,
  TerminalMessageQueueStopResult,
  TerminalMessageQueueTerminalVerdict,
  TerminalQueuedMessage
} from '../../shared/terminal-message-queue-contract'
import type { LeadTurnReading } from './terminal-message-queue-lead-turn'
import { buildQueueSnapshot, type QueuedItemRecord } from './terminal-message-queue-items'
import { TerminalMessageQueueTurnTracker } from './terminal-message-queue-turn-tracker'

/** `dialog`: a question/approval surfaced, so nothing was submitted. */
export type TerminalMessageQueueDeliveryOutcome = 'delivered' | 'dialog' | 'unverifiable' | 'failed'

export type TerminalMessageQueueDeps = {
  now: () => number
  newId: () => string
  readLeadTurn: () => LeadTurnReading
  deliver: (item: TerminalQueuedMessage) => Promise<TerminalMessageQueueDeliveryOutcome>
  /** Writes the agent's interrupt key; false when the terminal refused the write. */
  interrupt: () => Promise<boolean>
}

/** State, snapshots and fan-out for one terminal's queue; TerminalMessageQueue adds behaviour. */
export abstract class TerminalMessageQueueCore {
  protected items: QueuedItemRecord[] = []
  protected revision = 0
  protected terminal: TerminalMessageQueueTerminalVerdict = 'live'
  protected delivery: Promise<void> | null = null
  protected stopping: Promise<TerminalMessageQueueStopResult> | null = null
  protected pumpTimer: ReturnType<typeof setTimeout> | null = null
  protected publishedLead: TerminalMessageQueueLead
  private readonly listeners = new Set<(event: TerminalMessageQueueEvent) => void>()
  protected readonly turns: TerminalMessageQueueTurnTracker

  constructor(protected readonly deps: TerminalMessageQueueDeps) {
    this.turns = new TerminalMessageQueueTurnTracker(deps.now)
    this.turns.observe(deps.readLeadTurn())
    this.publishedLead = this.turns.lead()
  }

  snapshot(): TerminalMessageQueueSnapshot {
    return buildQueueSnapshot({
      revision: this.revision,
      lead: this.turns.lead(),
      interrupting: this.stopping !== null,
      terminal: this.terminal,
      items: this.items,
      now: this.deps.now()
    })
  }

  subscribe(listener: (event: TerminalMessageQueueEvent) => void): () => void {
    this.listeners.add(listener)
    listener({ type: 'snapshot', snapshot: this.snapshot() })
    return () => {
      this.listeners.delete(listener)
    }
  }

  get listenerCount(): number {
    return this.listeners.size
  }

  get itemCount(): number {
    return this.items.length
  }

  get terminalVerdict(): TerminalMessageQueueTerminalVerdict {
    return this.terminal
  }

  protected observeStatus(): void {
    this.turns.observe(this.deps.readLeadTurn())
    const lead = this.turns.lead()
    if (lead !== this.publishedLead) {
      this.changed()
    }
  }

  protected schedulePump(delayMs: number): void {
    this.cancelPump()
    this.pumpTimer = setTimeout(() => {
      this.pumpTimer = null
      this.pump()
    }, delayMs)
  }

  protected cancelPump(): void {
    if (this.pumpTimer !== null) {
      clearTimeout(this.pumpTimer)
      this.pumpTimer = null
    }
  }

  protected changed(): void {
    this.revision += 1
    this.publishedLead = this.turns.lead()
    this.emit({ type: 'snapshot', snapshot: this.snapshot() })
  }

  protected emit(event: TerminalMessageQueueEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event)
      } catch (error) {
        console.error('[terminal-message-queue] listener threw', error)
      }
    }
  }

  protected endSubscriptions(): void {
    this.emit({ type: 'end' })
    this.listeners.clear()
  }

  protected abstract pump(settled?: boolean): void
}
