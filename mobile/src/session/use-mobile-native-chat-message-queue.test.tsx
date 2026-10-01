import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  TerminalMessageQueueSnapshot,
  TerminalQueuedMessage
} from '../../../src/shared/terminal-message-queue-contract'
import type { RpcClient } from '../transport/rpc-client'
import { markRpcDeliveryUnknown } from '../transport/rpc-delivery-ambiguity'
import { clearMobileQueueOrphansForTests } from './mobile-terminal-message-queue-orphans'
import {
  useMobileNativeChatMessageQueue,
  type MobileNativeChatMessageQueue
} from './use-mobile-native-chat-message-queue'

function item(
  id: string,
  text: string,
  state: TerminalQueuedMessage['state'] = 'queued',
  extra: Partial<TerminalQueuedMessage> = {}
): TerminalQueuedMessage {
  return { id, text, queuedAt: 1_000, state, ...extra }
}

function snap(
  revision: number,
  items: TerminalQueuedMessage[],
  extra: Partial<TerminalMessageQueueSnapshot> = {}
): TerminalMessageQueueSnapshot {
  return { revision, lead: 'working', interrupting: false, terminal: 'live', items, ...extra }
}

type Stream = {
  method: string
  params: unknown
  onData: (frame: unknown) => void
  closed: boolean
}

function fakeHost(replies: Record<string, (params: Record<string, unknown>) => unknown>) {
  const streams: Stream[] = []
  const sendRequest = vi.fn(async (method: string, params: Record<string, unknown>) => {
    const reply = replies[method]
    if (!reply) {
      return { id: 'r', ok: false, error: { code: 'method_not_found', message: method } }
    }
    return { id: 'r', ok: true, result: await reply(params) }
  })
  const subscribe = vi.fn((method: string, params: unknown, onData: (frame: unknown) => void) => {
    const stream: Stream = { method, params, onData, closed: false }
    streams.push(stream)
    return () => {
      stream.closed = true
    }
  })
  const client = { sendRequest, subscribe } as unknown as RpcClient
  const live = (): Stream => {
    const stream = streams.findLast((candidate) => !candidate.closed)
    if (!stream) {
      throw new Error('no live stream')
    }
    return stream
  }
  return { client, sendRequest, subscribe, streams, live }
}

type HarnessProps = {
  client: RpcClient | null
  supported: boolean
  terminal: string | null
  onDeliveryStarted?: (item: TerminalQueuedMessage) => void
  onDelivered?: (item: TerminalQueuedMessage) => void
}

describe('useMobileNativeChatMessageQueue', () => {
  let renderer: ReactTestRenderer | null = null
  let queue: MobileNativeChatMessageQueue | null = null

  function Harness(props: HarnessProps): null {
    queue = useMobileNativeChatMessageQueue({
      client: props.client,
      supported: props.supported,
      terminal: props.terminal,
      scopeKey: 'host\0wt\0tab-1',
      session: { agent: 'claude', sessionId: 'session-1' },
      onDeliveryStarted: props.onDeliveryStarted ?? (() => {}),
      onDelivered: props.onDelivered ?? (() => {})
    })
    return null
  }

  async function mount(props: HarnessProps): Promise<void> {
    await act(async () => {
      renderer = create(createElement(Harness, props))
    })
  }

  async function update(props: HarnessProps): Promise<void> {
    await act(async () => {
      renderer?.update(createElement(Harness, props))
    })
  }

  async function emit(stream: Stream, frame: unknown): Promise<void> {
    await act(async () => stream.onData(frame))
  }

  beforeEach(() => {
    queue = null
    clearMobileQueueOrphansForTests()
  })

  afterEach(() => {
    act(() => renderer?.unmount())
    renderer = null
    vi.useRealTimers()
  })

  it('stays off on a host without the capability', async () => {
    const host = fakeHost({})
    await mount({ client: host.client, supported: false, terminal: 'term-1' })
    expect(host.subscribe).not.toHaveBeenCalled()
    expect(queue?.active).toBe(false)
    expect(queue?.willQueue).toBe(false)
    expect(await queue?.submit('hello')).toBe('unavailable')
    expect(await queue?.stop()).toBe('fallback')
    expect(host.sendRequest).not.toHaveBeenCalled()
  })

  it('subscribes by terminal handle and renders the snapshot', async () => {
    const host = fakeHost({})
    await mount({ client: host.client, supported: true, terminal: 'term-1' })
    expect(host.live().method).toBe('terminalMessageQueue.subscribe')
    expect(host.live().params).toEqual({
      terminal: 'term-1',
      session: { agent: 'claude', sessionId: 'session-1' }
    })
    expect(queue?.active).toBe(false)
    await emit(host.live(), {
      type: 'snapshot',
      snapshot: snap(2, [item('a', 'first'), item('b', 'second')])
    })
    expect(queue?.active).toBe(true)
    expect(queue?.willQueue).toBe(true)
    expect(queue?.snapshot.items.map((entry) => entry.text)).toEqual(['first', 'second'])
  })

  it('answers direct when the host says the agent is idle, and queued otherwise', async () => {
    let disposition: 'direct' | 'queued' = 'direct'
    const host = fakeHost({
      'terminalMessageQueue.submit': (params) =>
        disposition === 'direct'
          ? { disposition: 'direct', snapshot: snap(1, [], { lead: 'idle' }) }
          : {
              disposition: 'queued',
              item: item('q1', String(params.text)),
              snapshot: snap(3, [item('q1', String(params.text))])
            }
    })
    await mount({ client: host.client, supported: true, terminal: 'term-1' })
    await emit(host.live(), { type: 'snapshot', snapshot: snap(0, [], { lead: 'idle' }) })

    let outcome: string | undefined
    await act(async () => {
      outcome = await queue?.submit('hi')
    })
    expect(outcome).toBe('direct')
    expect(queue?.snapshot.items).toEqual([])

    disposition = 'queued'
    await act(async () => {
      outcome = await queue?.submit('later', ['/tmp/a.png'])
    })
    expect(outcome).toBe('queued')
    expect(host.sendRequest).toHaveBeenLastCalledWith(
      'terminalMessageQueue.submit',
      {
        terminal: 'term-1',
        text: 'later',
        imagePaths: ['/tmp/a.png'],
        session: { agent: 'claude', sessionId: 'session-1' }
      },
      expect.objectContaining({ timeoutMs: expect.any(Number) })
    )
    expect(queue?.snapshot.items.map((entry) => entry.id)).toEqual(['q1'])
  })

  it('reports a lost submit reply as unknown, never as safe to resend', async () => {
    const host = fakeHost({})
    host.sendRequest.mockImplementation(async () => {
      throw markRpcDeliveryUnknown(new Error('Request timed out'))
    })
    await mount({ client: host.client, supported: true, terminal: 'term-1' })
    await emit(host.live(), { type: 'snapshot', snapshot: snap(0, []) })
    expect(await queue?.submit('hi')).toBe('unknown')
  })

  it('maps host refusals', async () => {
    const host = fakeHost({
      'terminalMessageQueue.submit': () => ({ disposition: 'refused', reason: 'queue-full' })
    })
    await mount({ client: host.client, supported: true, terminal: 'term-1' })
    await emit(host.live(), { type: 'snapshot', snapshot: snap(0, []) })
    expect(await queue?.submit('hi')).toBe('queue-full')
    host.sendRequest.mockResolvedValueOnce({
      id: 'r',
      ok: false,
      error: { code: 'invalid_params', message: 'nope' }
    })
    expect(await queue?.submit('hi')).toBe('unavailable')
  })

  it('removes, holds, saves and releases an item', async () => {
    const host = fakeHost({
      'terminalMessageQueue.remove': () => ({ snapshot: snap(5, [item('b', 'second')]) }),
      'terminalMessageQueue.edit': (params) => ({
        outcome: params.text !== undefined ? 'edited' : params.editing ? 'held' : 'released',
        snapshot: snap(6, [item('b', String(params.text ?? 'second'))])
      })
    })
    await mount({ client: host.client, supported: true, terminal: 'term-1' })
    await emit(host.live(), {
      type: 'snapshot',
      snapshot: snap(4, [item('a', 'first'), item('b', 'second')])
    })
    await act(async () => queue?.remove('a'))
    expect(host.sendRequest).toHaveBeenCalledWith(
      'terminalMessageQueue.remove',
      { terminal: 'term-1', itemId: 'a' },
      expect.anything()
    )
    expect(queue?.snapshot.items.map((entry) => entry.id)).toEqual(['b'])
    // A removal the host confirms is not a lost item.
    expect(queue?.orphans).toEqual([])

    await act(async () => queue?.setEditing('b', true))
    expect(host.sendRequest).toHaveBeenLastCalledWith(
      'terminalMessageQueue.edit',
      { terminal: 'term-1', itemId: 'b', editing: true },
      expect.anything()
    )
    let saved: boolean | undefined
    await act(async () => {
      saved = await queue?.saveEdit('b', 'second, edited')
    })
    expect(saved).toBe(true)
    expect(queue?.snapshot.items[0]?.text).toBe('second, edited')
    await act(async () => queue?.setEditing('b', false))
    expect(host.sendRequest).toHaveBeenLastCalledWith(
      'terminalMessageQueue.edit',
      { terminal: 'term-1', itemId: 'b', editing: false },
      expect.anything()
    )
  })

  it('reports delivery start once, then the delivered item, without calling it lost', async () => {
    const onDeliveryStarted = vi.fn()
    const onDelivered = vi.fn()
    const host = fakeHost({})
    await mount({
      client: host.client,
      supported: true,
      terminal: 'term-1',
      onDeliveryStarted,
      onDelivered
    })
    const stream = host.live()
    await emit(stream, { type: 'snapshot', snapshot: snap(1, [item('a', 'first')]) })
    await emit(stream, { type: 'snapshot', snapshot: snap(2, [item('a', 'first', 'delivering')]) })
    await emit(stream, { type: 'snapshot', snapshot: snap(3, [item('a', 'first', 'delivering')]) })
    expect(onDeliveryStarted).toHaveBeenCalledTimes(1)
    await emit(stream, { type: 'delivered', item: item('a', 'first') })
    await emit(stream, { type: 'snapshot', snapshot: snap(4, [], { lead: 'working' }) })
    expect(onDelivered).toHaveBeenCalledWith(expect.objectContaining({ id: 'a', text: 'first' }))
    expect(queue?.orphans).toEqual([])
  })

  it('drops a reply snapshot older than the stream', async () => {
    const host = fakeHost({
      'terminalMessageQueue.sendNext': () => ({
        outcome: 'sent',
        snapshot: snap(1, [item('x', 'x')])
      })
    })
    await mount({ client: host.client, supported: true, terminal: 'term-1' })
    await emit(host.live(), { type: 'snapshot', snapshot: snap(7, []) })
    await act(async () => queue?.sendNext())
    expect(queue?.snapshot.revision).toBe(7)
    expect(queue?.snapshot.items).toEqual([])
  })

  it('keeps an unverifiable Stop for "Send next now", which asks the host to send', async () => {
    const host = fakeHost({
      'terminalMessageQueue.stop': () => ({
        outcome: 'unverifiable',
        snapshot: snap(3, [item('a', 'first')])
      }),
      'terminalMessageQueue.sendNext': () => ({ outcome: 'sent', snapshot: snap(4, []) })
    })
    await mount({ client: host.client, supported: true, terminal: 'term-1' })
    await emit(host.live(), { type: 'snapshot', snapshot: snap(2, [item('a', 'first')]) })
    let result: string | undefined
    await act(async () => {
      result = await queue?.stop()
    })
    expect(result).toBe('host')
    expect(queue?.lastStop).toBe('unverifiable')
    expect(host.sendRequest).toHaveBeenLastCalledWith(
      'terminalMessageQueue.stop',
      { terminal: 'term-1', session: { agent: 'claude', sessionId: 'session-1' } },
      expect.anything()
    )
    await act(async () => queue?.sendNext())
    expect(host.sendRequest).toHaveBeenLastCalledWith(
      'terminalMessageQueue.sendNext',
      { terminal: 'term-1' },
      expect.anything()
    )
    expect(queue?.lastStop).toBeNull()
  })

  it('falls back to its own Stop only when the host definitely did nothing', async () => {
    const host = fakeHost({})
    await mount({ client: host.client, supported: true, terminal: 'term-1' })
    await emit(host.live(), { type: 'snapshot', snapshot: snap(1, []) })
    expect(await queue?.stop()).toBe('fallback')
    host.sendRequest.mockImplementationOnce(async () => {
      throw markRpcDeliveryUnknown(new Error('lost'))
    })
    expect(await queue?.stop()).toBe('unknown')
  })

  it('resubscribes when the stream ends and offers back items the host lost', async () => {
    vi.useFakeTimers()
    const host = fakeHost({})
    await mount({ client: host.client, supported: true, terminal: 'term-1' })
    const first = host.live()
    await emit(first, {
      type: 'snapshot',
      snapshot: snap(5, [item('a', 'kept'), item('b', 'gone')])
    })
    await emit(first, { type: 'end' })
    expect(queue?.active).toBe(false)
    await act(async () => {
      vi.advanceTimersByTime(2_000)
    })
    const second = host.live()
    expect(second).not.toBe(first)
    // A restarted host starts its revisions again; the fresh stream still wins.
    await emit(second, { type: 'snapshot', snapshot: snap(1, [item('a', 'kept')]) })
    expect(queue?.active).toBe(true)
    expect(queue?.orphans).toEqual([
      expect.objectContaining({ id: 'b', text: 'gone', reason: 'lost' })
    ])
    await act(async () => queue?.dismissOrphan('b'))
    expect(queue?.orphans).toEqual([])
  })

  it('does not call items lost after the chat stopped watching', async () => {
    const host = fakeHost({})
    await mount({ client: host.client, supported: true, terminal: 'term-1' })
    await emit(host.live(), { type: 'snapshot', snapshot: snap(5, [item('a', 'first')]) })
    await update({ client: host.client, supported: true, terminal: null })
    expect(host.streams.every((stream) => stream.closed)).toBe(true)
    await update({ client: host.client, supported: true, terminal: 'term-1' })
    await emit(host.live(), { type: 'snapshot', snapshot: snap(9, []) })
    expect(queue?.orphans).toEqual([])
  })

  it('ignores a frame it cannot read', async () => {
    const host = fakeHost({})
    await mount({ client: host.client, supported: true, terminal: 'term-1' })
    await emit(host.live(), { type: 'snapshot', snapshot: { revision: 'x' } })
    expect(queue?.active).toBe(false)
  })
})
