import { describe, expect, it } from 'vitest'
import { findVanishedQueueItems } from './native-chat-message-queue-orphans'

const queued = (id: string, extra: object = {}) => ({
  id,
  text: id,
  queuedAt: 1,
  state: 'queued' as const,
  ...extra
})

describe('findVanishedQueueItems', () => {
  it('reports items that left without a delivered or removed event', () => {
    expect(
      findVanishedQueueItems({
        previous: [queued('a'), queued('b'), queued('c')],
        next: [queued('c')],
        retiredIds: new Set(['a'])
      })
    ).toEqual([{ id: 'b', text: 'b', reason: 'lost' }])
  })

  it('keeps the exit reason and skips items that were already being typed', () => {
    expect(
      findVanishedQueueItems({
        previous: [
          queued('a', { state: 'undeliverable', undeliverableReason: 'exited' }),
          queued('b', { state: 'delivering' })
        ],
        next: [],
        retiredIds: new Set()
      })
    ).toEqual([{ id: 'a', text: 'a', reason: 'exited' }])
  })
})
