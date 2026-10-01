import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  TerminalMessageQueueEvent,
  TerminalQueuedMessage
} from '../../shared/terminal-message-queue-contract'
import {
  TERMINAL_MESSAGE_QUEUE_TIMINGS,
  TerminalMessageQueue,
  type TerminalMessageQueueDeliveryOutcome
} from './terminal-message-queue'
import type { LeadTurnReading } from './terminal-message-queue-lead-turn'
import { TERMINAL_MESSAGE_QUEUE_TURN_TIMINGS } from './terminal-message-queue-turn-tracker'

type Harness = {
  queue: TerminalMessageQueue
  delivered: string[]
  events: TerminalMessageQueueEvent[]
  interrupt: ReturnType<typeof vi.fn>
  setLead: (reading: LeadTurnReading) => void
  nextOutcome: (outcome: TerminalMessageQueueDeliveryOutcome) => void
}

const WORKING_T1: LeadTurnReading = { lead: 'working', turnKey: 't1' }
const DONE_T1: LeadTurnReading = { lead: 'idle', turnKey: 't1' }

function createHarness(initial: LeadTurnReading = WORKING_T1): Harness {
  let reading = initial
  let id = 0
  const outcomes: TerminalMessageQueueDeliveryOutcome[] = []
  const delivered: string[] = []
  const events: TerminalMessageQueueEvent[] = []
  const interrupt = vi.fn(async () => true)
  const queue = new TerminalMessageQueue({
    now: () => Date.now(),
    newId: () => `item-${++id}`,
    readLeadTurn: () => reading,
    deliver: async (item: TerminalQueuedMessage) => {
      const outcome = outcomes.shift() ?? 'delivered'
      if (outcome === 'delivered') {
        delivered.push(item.text)
      }
      return outcome
    },
    interrupt
  })
  queue.subscribe((event) => events.push(event))
  return {
    queue,
    delivered,
    events,
    interrupt,
    setLead: (next) => {
      reading = next
      queue.noteStatusChanged()
    },
    nextOutcome: (outcome) => outcomes.push(outcome)
  }
}

async function settle(ms: number = TERMINAL_MESSAGE_QUEUE_TIMINGS.settleMs + 10): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms)
}

/** The agent picks up a delivered prompt: a new turn opens, then (optionally) ends. */
function startTurn(harness: Harness, turnKey: string): void {
  harness.setLead({ lead: 'working', turnKey })
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('TerminalMessageQueue', () => {
  it('lets an idle agent with nothing waiting take the client send directly', () => {
    const harness = createHarness(DONE_T1)
    expect(harness.queue.submit({ text: 'hello' }).disposition).toBe('direct')
    expect(harness.queue.snapshot().items).toEqual([])
  })

  it('holds while the main agent works and delivers at the turn end', async () => {
    const harness = createHarness()
    const result = harness.queue.submit({ text: 'first' })
    expect(result.disposition).toBe('queued')
    await settle(5_000)
    expect(harness.delivered).toEqual([])

    harness.setLead(DONE_T1)
    await settle()
    expect(harness.delivered).toEqual(['first'])
    expect(harness.queue.snapshot().items).toEqual([])
  })

  it('delivers one item per turn end, in order', async () => {
    const harness = createHarness()
    harness.queue.submit({ text: 'a' })
    harness.queue.submit({ text: 'b' })
    harness.queue.submit({ text: 'c' })

    harness.setLead(DONE_T1)
    await settle()
    expect(harness.delivered).toEqual(['a'])
    // The agent has not reported the new turn yet: still waiting on it, not sending b.
    await settle(2_000)
    expect(harness.delivered).toEqual(['a'])

    startTurn(harness, 't2')
    await settle(2_000)
    expect(harness.delivered).toEqual(['a'])
    harness.setLead({ lead: 'idle', turnKey: 't2' })
    await settle()
    expect(harness.delivered).toEqual(['a', 'b'])

    startTurn(harness, 't3')
    harness.setLead({ lead: 'idle', turnKey: 't3' })
    await settle()
    expect(harness.delivered).toEqual(['a', 'b', 'c'])
  })

  it('keeps reporting working after a delivery until the agent picks it up', async () => {
    const harness = createHarness()
    harness.queue.submit({ text: 'a' })
    harness.setLead(DONE_T1)
    await settle()
    expect(harness.queue.snapshot().lead).toBe('working')
    // A new client send in this window must queue, not race the delivered prompt.
    expect(harness.queue.submit({ text: 'b' }).disposition).toBe('queued')
  })

  it('moves on when a delivered prompt never shows a turn start within the grace', async () => {
    const harness = createHarness()
    harness.queue.submit({ text: 'a' })
    harness.queue.submit({ text: 'b' })
    harness.setLead(DONE_T1)
    await settle()
    expect(harness.delivered).toEqual(['a'])
    await settle(TERMINAL_MESSAGE_QUEUE_TURN_TIMINGS.turnStartGraceMs + 1_000)
    expect(harness.delivered).toEqual(['a', 'b'])
  })

  it('removes a queued item so it is never delivered', async () => {
    const harness = createHarness()
    harness.queue.submit({ text: 'a' })
    const b = harness.queue.submit({ text: 'b' })
    if (b.disposition !== 'queued') {
      throw new Error('expected queued')
    }
    expect(harness.queue.remove(b.item.id)).toBe(true)
    expect(harness.events).toContainEqual({ type: 'removed', itemId: b.item.id })
    harness.setLead(DONE_T1)
    await settle()
    startTurn(harness, 't2')
    harness.setLead({ lead: 'idle', turnKey: 't2' })
    await settle(TERMINAL_MESSAGE_QUEUE_TURN_TIMINGS.turnStartGraceMs + 1_000)
    expect(harness.delivered).toEqual(['a'])
  })

  it('refuses to remove an item mid-delivery', async () => {
    let release: (outcome: TerminalMessageQueueDeliveryOutcome) => void = () => {}
    let reading: LeadTurnReading = WORKING_T1
    const queue = new TerminalMessageQueue({
      now: () => Date.now(),
      newId: () => 'only',
      readLeadTurn: () => reading,
      deliver: () => new Promise((resolve) => (release = resolve)),
      interrupt: async () => true
    })
    queue.submit({ text: 'x' })
    reading = DONE_T1
    queue.noteStatusChanged()
    await settle()
    expect(queue.snapshot().items[0]?.state).toBe('delivering')
    expect(queue.remove('only')).toBe(false)
    release('delivered')
    await settle(0)
    expect(queue.snapshot().items).toEqual([])
  })

  it('delivers the edited text and holds the head while an edit lease is open', async () => {
    const harness = createHarness()
    const a = harness.queue.submit({ text: 'draft' })
    if (a.disposition !== 'queued') {
      throw new Error('expected queued')
    }
    expect(harness.queue.edit(a.item.id, { editing: true }).outcome).toBe('held')
    expect(harness.queue.snapshot().items[0]?.editing).toBe(true)
    harness.setLead(DONE_T1)
    await settle(2_000)
    expect(harness.delivered).toEqual([])

    expect(harness.queue.edit(a.item.id, { text: 'final' }).outcome).toBe('edited')
    await settle()
    expect(harness.delivered).toEqual(['final'])
    expect(harness.queue.edit(a.item.id, { text: 'late' }).outcome).toBe('not-found')
  })

  it('lets an abandoned edit lease expire so the queue does not stall', async () => {
    const harness = createHarness()
    const a = harness.queue.submit({ text: 'draft' })
    if (a.disposition !== 'queued') {
      throw new Error('expected queued')
    }
    harness.queue.edit(a.item.id, { editing: true })
    harness.setLead(DONE_T1)
    await settle(TERMINAL_MESSAGE_QUEUE_TIMINGS.editLeaseMs + 1_000)
    expect(harness.delivered).toEqual(['draft'])
  })

  it('treats an edit that empties the message as a removal', () => {
    const harness = createHarness()
    const a = harness.queue.submit({ text: 'draft' })
    if (a.disposition !== 'queued') {
      throw new Error('expected queued')
    }
    harness.queue.edit(a.item.id, { text: '   ' })
    expect(harness.queue.snapshot().items).toEqual([])
  })

  it('holds while a dialog is open and never types into it', async () => {
    const harness = createHarness({ lead: 'dialog', turnKey: 't1' })
    expect(harness.queue.submit({ text: 'a' }).disposition).toBe('queued')
    await settle(10_000)
    expect(harness.delivered).toEqual([])
    harness.setLead(DONE_T1)
    await settle()
    expect(harness.delivered).toEqual(['a'])
  })

  it('retries when the runtime refuses to type because a prompt surfaced', async () => {
    const harness = createHarness()
    harness.queue.submit({ text: 'a' })
    harness.nextOutcome('dialog')
    harness.setLead(DONE_T1)
    await settle()
    expect(harness.delivered).toEqual([])
    expect(harness.queue.snapshot().items[0]?.state).toBe('queued')
    await settle(TERMINAL_MESSAGE_QUEUE_TIMINGS.retryMs + TERMINAL_MESSAGE_QUEUE_TIMINGS.settleMs)
    expect(harness.delivered).toEqual(['a'])
  })

  it('hands an item back after repeated failures instead of retrying forever', async () => {
    const harness = createHarness()
    harness.queue.submit({ text: 'a' })
    harness.nextOutcome('failed')
    harness.nextOutcome('failed')
    harness.nextOutcome('failed')
    harness.setLead(DONE_T1)
    await settle(30_000)
    const [item] = harness.queue.snapshot().items
    expect(item?.state).toBe('undeliverable')
    expect(item?.undeliverableReason).toBe('failed')
  })

  it('emits delivered before the snapshot that drops the item', async () => {
    const harness = createHarness()
    harness.queue.submit({ text: 'a' })
    harness.setLead(DONE_T1)
    await settle()
    const deliveredIndex = harness.events.findIndex((event) => event.type === 'delivered')
    const droppedIndex = harness.events.findIndex(
      (event, index) =>
        index > deliveredIndex && event.type === 'snapshot' && event.snapshot.items.length === 0
    )
    expect(deliveredIndex).toBeGreaterThan(-1)
    expect(droppedIndex).toBeGreaterThan(deliveredIndex)
  })

  describe('Stop', () => {
    it('interrupts, waits for the turn to end, then sends the next item at once', async () => {
      const harness = createHarness()
      harness.queue.submit({ text: 'next' })
      const stop = harness.queue.stop()
      await settle(0)
      expect(harness.interrupt).toHaveBeenCalledTimes(1)
      expect(harness.queue.snapshot().interrupting).toBe(true)
      harness.setLead(DONE_T1)
      expect((await stop).outcome).toBe('turn-ended')
      await settle()
      expect(harness.delivered).toEqual(['next'])
    })

    it('accepts the transcript interrupt marker when the agent sends no hook on cancel', async () => {
      const harness = createHarness()
      harness.queue.submit({ text: 'next' })
      const stop = harness.queue.stop()
      await settle(0)
      // Claude Code: the row keeps reading working; only the transcript says the turn ended.
      harness.queue.noteTranscriptTurnEnded()
      expect((await stop).outcome).toBe('turn-ended')
      await settle()
      expect(harness.delivered).toEqual(['next'])
      expect(harness.queue.snapshot().lead).toBe('working')
    })

    it('reports unverifiable when the end is never seen, and keeps the item queued', async () => {
      const harness = createHarness()
      harness.queue.submit({ text: 'next' })
      const stop = harness.queue.stop()
      await settle(TERMINAL_MESSAGE_QUEUE_TURN_TIMINGS.stopConfirmMs + 100)
      expect((await stop).outcome).toBe('unverifiable')
      await settle()
      expect(harness.delivered).toEqual([])
      expect(harness.queue.snapshot().items).toHaveLength(1)

      expect(harness.queue.sendNext().outcome).toBe('sent')
      await settle()
      expect(harness.delivered).toEqual(['next'])
    })

    it('reports unverifiable when the interrupt write is refused', async () => {
      const harness = createHarness()
      harness.interrupt.mockResolvedValueOnce(false)
      harness.queue.submit({ text: 'next' })
      expect((await harness.queue.stop()).outcome).toBe('unverifiable')
      expect(harness.queue.snapshot().items).toHaveLength(1)
    })

    it('sends straight away when no turn is running', async () => {
      const harness = createHarness()
      harness.queue.submit({ text: 'next' })
      harness.setLead(DONE_T1)
      const stop = harness.queue.stop()
      expect((await stop).outcome).toBe('not-working')
      expect(harness.interrupt).not.toHaveBeenCalled()
      await settle()
      expect(harness.delivered).toEqual(['next'])
    })

    it('stops a turn that is asking for approval', async () => {
      const harness = createHarness({ lead: 'dialog', turnKey: 't1' })
      harness.queue.submit({ text: 'next' })
      const stop = harness.queue.stop()
      await settle(0)
      expect(harness.interrupt).toHaveBeenCalled()
      harness.queue.noteTranscriptTurnEnded()
      expect((await stop).outcome).toBe('turn-ended')
      await settle()
      expect(harness.delivered).toEqual(['next'])
    })
  })

  describe('terminal exit', () => {
    it('keeps items as undeliverable and refuses new ones once the PTY exited', async () => {
      const harness = createHarness()
      harness.queue.submit({ text: 'a' })
      harness.queue.noteTerminalExit('exited')
      const snapshot = harness.queue.snapshot()
      expect(snapshot.terminal).toBe('exited')
      expect(snapshot.items[0]).toMatchObject({
        state: 'undeliverable',
        undeliverableReason: 'exited'
      })
      expect(harness.queue.submit({ text: 'b' })).toEqual({
        disposition: 'refused',
        reason: 'terminal-exited'
      })
      harness.setLead(DONE_T1)
      await settle()
      expect(harness.delivered).toEqual([])
    })

    it('treats an unconfirmed exit as unverifiable and keeps delivering once it reports again', async () => {
      const harness = createHarness()
      harness.queue.submit({ text: 'a' })
      harness.queue.noteTerminalExit('unverifiable')
      expect(harness.queue.snapshot().terminal).toBe('unverifiable')
      expect(harness.queue.snapshot().items[0]?.state).toBe('queued')
      harness.setLead(DONE_T1)
      expect(harness.queue.snapshot().terminal).toBe('live')
      await settle()
      expect(harness.delivered).toEqual(['a'])
    })
  })
})
