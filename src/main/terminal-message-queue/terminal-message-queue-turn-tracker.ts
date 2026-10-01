import type { TerminalMessageQueueLead } from '../../shared/terminal-message-queue-contract'
import { UNKNOWN_LEAD_TURN, type LeadTurnReading } from './terminal-message-queue-lead-turn'

export const TERMINAL_MESSAGE_QUEUE_TURN_TIMINGS = {
  /** After a delivery, how long the queue waits for the agent to show the new turn. */
  turnStartGraceMs: 15_000,
  /** How long Stop waits for the host to see the interrupted turn end. */
  stopConfirmMs: 8_000
}

const ENDED_TURN_MEMORY = 8

type StopWait = {
  turnKey: string | null
  resolve: (ended: boolean) => void
  timer: ReturnType<typeof setTimeout> | null
}

/**
 * Turns the host's status readings into "may the queue type now?".
 *
 * Status rows alone are not enough: Claude Code sends no hook when its turn is cancelled, so after
 * an interrupt the row keeps reading `working` until the next prompt. A turn the transcript (or a
 * confirmed Stop) has proven over is remembered here by key, so that stale row reads idle.
 */
export class TerminalMessageQueueTurnTracker {
  private reading: LeadTurnReading = UNKNOWN_LEAD_TURN
  private readonly endedTurnKeys: string[] = []
  private awaiting: { turnKey: string | null; until: number } | null = null
  private stopWait: StopWait | null = null

  constructor(private readonly now: () => number) {}

  observe(reading: LeadTurnReading): void {
    this.reading = reading
    if (this.awaiting && reading.turnKey !== this.awaiting.turnKey) {
      // The delivered prompt opened (or already closed) its own turn; the rows now describe it.
      this.awaiting = null
    }
    this.settleStopWait()
  }

  /** What the snapshot publishes: a delivered prompt the agent has not picked up still counts. */
  lead(): TerminalMessageQueueLead {
    const base = this.baseLead()
    if (base === 'idle' || base === 'unknown') {
      return this.awaitingRemainingMs() > 0 ? 'working' : base
    }
    return base
  }

  isTurnRunning(): boolean {
    return this.lead() === 'working' || this.lead() === 'dialog'
  }

  currentTurnKey(): string | null {
    return this.reading.turnKey
  }

  /** null: hold until the next status change; otherwise ms until delivery may start. */
  deliveryWaitMs(): number | null {
    const base = this.baseLead()
    if (base === 'working' || base === 'dialog') {
      return null
    }
    return this.awaitingRemainingMs()
  }

  noteDelivered(turnKeyBefore: string | null): void {
    this.awaiting = {
      turnKey: turnKeyBefore,
      until: this.now() + TERMINAL_MESSAGE_QUEUE_TURN_TIMINGS.turnStartGraceMs
    }
  }

  /** Proven over by evidence the status row cannot carry (transcript marker, user override). */
  endCurrentTurn(): void {
    // A dialog counts: Claude writes the same marker, and sends no hook, when an approval is denied.
    const { lead, turnKey } = this.reading
    if ((lead === 'working' || lead === 'dialog') && turnKey !== null) {
      this.rememberEnded(turnKey)
    }
    this.awaiting = null
    // Unarmed (Stop is still writing its interrupt) settles when waitForStop arms it.
    this.settleStopWait()
  }

  beginStop(): void {
    this.cancelWait()
    this.stopWait = {
      turnKey: this.reading.turnKey,
      resolve: () => {},
      timer: null
    }
  }

  waitForStop(): Promise<boolean> {
    const wait = this.stopWait
    if (!wait) {
      return Promise.resolve(false)
    }
    return new Promise((resolve) => {
      wait.resolve = resolve
      wait.timer = setTimeout(
        () => this.finishStopWait(false),
        TERMINAL_MESSAGE_QUEUE_TURN_TIMINGS.stopConfirmMs
      )
      this.settleStopWait()
    })
  }

  cancelWait(): void {
    if (this.stopWait) {
      this.finishStopWait(false)
    }
  }

  private baseLead(): TerminalMessageQueueLead {
    const { lead, turnKey } = this.reading
    if (
      (lead === 'working' || lead === 'dialog') &&
      turnKey !== null &&
      this.endedTurnKeys.includes(turnKey)
    ) {
      return 'idle'
    }
    return lead
  }

  private awaitingRemainingMs(): number {
    if (!this.awaiting) {
      return 0
    }
    const remaining = this.awaiting.until - this.now()
    if (remaining <= 0) {
      this.awaiting = null
      return 0
    }
    return remaining
  }

  private settleStopWait(): void {
    const wait = this.stopWait
    if (!wait || wait.timer === null) {
      return
    }
    const base = this.baseLead()
    if (base === 'working' && this.reading.turnKey !== wait.turnKey) {
      // A prompt submitted just before Stop opened a newer turn; that is the one being stopped.
      wait.turnKey = this.reading.turnKey
      return
    }
    if (base !== 'working' && base !== 'dialog') {
      this.finishStopWait(true)
    }
  }

  private finishStopWait(ended: boolean): void {
    const wait = this.stopWait
    if (!wait) {
      return
    }
    this.stopWait = null
    if (wait.timer !== null) {
      clearTimeout(wait.timer)
    }
    if (ended && wait.turnKey !== null) {
      this.rememberEnded(wait.turnKey)
    }
    this.awaiting = null
    wait.resolve(ended)
  }

  private rememberEnded(turnKey: string): void {
    if (this.endedTurnKeys.includes(turnKey)) {
      return
    }
    this.endedTurnKeys.push(turnKey)
    if (this.endedTurnKeys.length > ENDED_TURN_MEMORY) {
      this.endedTurnKeys.shift()
    }
  }
}
