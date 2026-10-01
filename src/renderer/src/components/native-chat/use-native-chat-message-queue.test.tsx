// @vitest-environment happy-dom
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type {
  TerminalMessageQueueEvent,
  TerminalMessageQueueSnapshot
} from '../../../../shared/terminal-message-queue-contract'

type ClientState = {
  supported: boolean
  emit: ((event: TerminalMessageQueueEvent) => void) | null
  close: (() => void) | null
  subscribeCalls: number
  unsubscribes: Mock<() => void>[]
  submit: Mock<(...args: unknown[]) => unknown>
  stop: Mock<(...args: unknown[]) => unknown>
}

const client = vi.hoisted((): ClientState => ({
  supported: true,
  emit: null,
  close: null,
  subscribeCalls: 0,
  unsubscribes: [],
  submit: vi.fn(),
  stop: vi.fn()
}))

vi.mock('@/runtime/terminal-message-queue-client', () => ({
  terminalMessageQueueTargetForPty: (ptyId: string) => ({
    runtime: { kind: 'local' },
    ref: { ptyId }
  }),
  supportsTerminalMessageQueue: async () => client.supported,
  subscribeTerminalMessageQueue: async (
    _target: unknown,
    _session: unknown,
    handlers: { onEvent: (event: TerminalMessageQueueEvent) => void; onClose: () => void }
  ) => {
    client.subscribeCalls += 1
    client.emit = handlers.onEvent
    client.close = handlers.onClose
    const unsubscribe = vi.fn()
    client.unsubscribes.push(unsubscribe)
    return { unsubscribe }
  },
  terminalMessageQueueClient: {
    submit: (...args: unknown[]) => client.submit(...args),
    stop: (...args: unknown[]) => client.stop(...args),
    remove: vi.fn(),
    edit: vi.fn(),
    sendNext: vi.fn()
  }
}))

import { useNativeChatMessageQueue } from './use-native-chat-message-queue'
import { clearQueueOrphansForTests } from './native-chat-message-queue-orphans'

function snapshot(overrides: Partial<TerminalMessageQueueSnapshot>): TerminalMessageQueueSnapshot {
  return {
    revision: 1,
    lead: 'idle',
    interrupting: false,
    terminal: 'live',
    items: [],
    ...overrides
  }
}

function mount(onDelivered = vi.fn()) {
  const initialProps: { ptyId: string | null } = { ptyId: 'pty-1' }
  return renderHook(
    ({ ptyId }: { ptyId: string | null }) =>
      useNativeChatMessageQueue({
        paneKey: 'tab:leaf',
        ptyId,
        session: { agent: 'claude', sessionId: 's-1' },
        onDelivered
      }),
    { initialProps }
  )
}

beforeEach(() => {
  client.supported = true
  client.emit = null
  client.subscribeCalls = 0
  client.unsubscribes = []
  client.submit.mockReset()
  client.stop.mockReset()
  clearQueueOrphansForTests()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useNativeChatMessageQueue', () => {
  // Ending the subscription is what releases the host listener: an IPC abort locally, and the
  // stream's own socket for a paired runtime.
  it('ends its subscription when the pane moves to another terminal and on unmount', async () => {
    const { rerender, unmount } = mount()
    await waitFor(() => expect(client.unsubscribes).toHaveLength(1))
    const [first] = client.unsubscribes

    rerender({ ptyId: 'pty-2' })
    await waitFor(() => expect(client.unsubscribes).toHaveLength(2))
    expect(first).toHaveBeenCalledTimes(1)

    unmount()
    expect(client.unsubscribes[1]).toHaveBeenCalledTimes(1)
  })

  it('stays inactive against a host without the queue, so sends stay direct', async () => {
    client.supported = false
    const { result } = mount()
    await act(async () => {})
    expect(client.subscribeCalls).toBe(0)
    expect(result.current.active).toBe(false)
    expect(result.current.willQueue).toBe(false)
    expect(result.current.stop()).toBe(false)
    expect(await result.current.enqueue('x', [])).toBe('failed')
  })

  it('queues while the host reports the main agent working', async () => {
    const { result } = mount()
    await waitFor(() => expect(client.emit).not.toBeNull())
    act(() => client.emit!({ type: 'snapshot', snapshot: snapshot({ lead: 'idle' }) }))
    expect(result.current.active).toBe(true)
    expect(result.current.willQueue).toBe(false)
    act(() =>
      client.emit!({ type: 'snapshot', snapshot: snapshot({ revision: 2, lead: 'working' }) })
    )
    expect(result.current.willQueue).toBe(true)
  })

  it('echoes a delivered item and offers back one that vanished undelivered', async () => {
    const onDelivered = vi.fn()
    const { result } = mount(onDelivered)
    await waitFor(() => expect(client.emit).not.toBeNull())
    const a = { id: 'a', text: 'A', queuedAt: 1, state: 'queued' as const }
    const b = { id: 'b', text: 'B', queuedAt: 2, state: 'queued' as const }
    act(() =>
      client.emit!({ type: 'snapshot', snapshot: snapshot({ lead: 'working', items: [a, b] }) })
    )
    act(() => client.emit!({ type: 'delivered', item: a }))
    act(() => client.emit!({ type: 'snapshot', snapshot: snapshot({ revision: 3, items: [b] }) }))
    expect(onDelivered).toHaveBeenCalledWith(a)
    expect(result.current.orphans).toEqual([])

    // A restarted host comes back empty: B was never delivered or removed.
    act(() => client.close!())
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 2_100))
    })
    await waitFor(() => expect(client.subscribeCalls).toBe(2))
    act(() => client.emit!({ type: 'snapshot', snapshot: snapshot({ revision: 0, items: [] }) }))
    expect(result.current.orphans).toEqual([{ id: 'b', text: 'B', reason: 'lost' }])
  })

  it('ignores an older revision that would resurrect a removed item', async () => {
    const { result } = mount()
    await waitFor(() => expect(client.emit).not.toBeNull())
    const a = { id: 'a', text: 'A', queuedAt: 1, state: 'queued' as const }
    act(() => client.emit!({ type: 'snapshot', snapshot: snapshot({ revision: 5, items: [] }) }))
    act(() => client.emit!({ type: 'snapshot', snapshot: snapshot({ revision: 4, items: [a] }) }))
    expect(result.current.snapshot.items).toEqual([])
  })

  it('routes Stop to the host when the queue is live', async () => {
    client.stop.mockResolvedValue({ outcome: 'turn-ended', snapshot: snapshot({ revision: 9 }) })
    const { result } = mount()
    await waitFor(() => expect(client.emit).not.toBeNull())
    act(() => client.emit!({ type: 'snapshot', snapshot: snapshot({ lead: 'working' }) }))
    let took = false
    act(() => {
      took = result.current.stop()
    })
    expect(took).toBe(true)
    await waitFor(() => expect(result.current.lastStop).toBe('turn-ended'))
  })
})
