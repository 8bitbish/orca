import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RpcDispatcher } from '../dispatcher'
import type { RpcRequest } from '../core'
import type { OrcaRuntimeService } from '../../orca-runtime'
import { isMobileRpcMethodAllowed } from '../../runtime-rpc/runtime-rpc-mobile-method-access'
import { RUNTIME_CAPABILITIES } from '../../../../shared/protocol-version'
import {
  TERMINAL_MESSAGE_QUEUE_RUNTIME_CAPABILITY,
  TERMINAL_MESSAGE_QUEUE_UNSUBSCRIBE_RUNTIME_CAPABILITY
} from '../../../../shared/terminal-message-queue-capability'
import { TerminalMessageQueueHost } from '../../../terminal-message-queue/terminal-message-queue-host'
import { createSubscriptionRegistryDouble } from '../subscription-registry-test-double'
import { ALL_RPC_METHODS } from './index'
import { TERMINAL_MESSAGE_QUEUE_METHODS } from './terminal-message-queue'

const METHOD_NAMES = [
  'terminalMessageQueue.unsubscribe',
  'terminalMessageQueue.submit',
  'terminalMessageQueue.list',
  'terminalMessageQueue.remove',
  'terminalMessageQueue.edit',
  'terminalMessageQueue.stop',
  'terminalMessageQueue.sendNext',
  'terminalMessageQueue.subscribe'
]

let working = true

function createDispatcher() {
  const host = new TerminalMessageQueueHost({
    resolveTarget: (ref) =>
      ref.ptyId === 'pty-1' || ref.terminal === 'term_1'
        ? { ptyId: 'pty-1', handle: 'term_1' }
        : null,
    paneKeyForPty: () => 'tab:leaf',
    deliver: async () => 'delivered',
    interrupt: async () => true
  })
  host.attachStatusSource({
    readPaneRows: () => [
      {
        paneKey: 'tab:leaf',
        connectionId: null,
        receivedAt: 1,
        stateStartedAt: 1,
        state: working ? 'working' : 'done',
        prompt: 'p',
        agentType: 'claude'
      }
    ],
    subscribe: () => () => {}
  })
  const registry = createSubscriptionRegistryDouble()
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: these methods read only the queue host, the runtime id and the subscription registry.
  const runtime = {
    getRuntimeId: () => 'test-runtime',
    terminalMessageQueue: host,
    ...registry
  } as unknown as OrcaRuntimeService
  let liveListeners = 0
  const subscribe = host.subscribe.bind(host)
  vi.spyOn(host, 'subscribe').mockImplementation((ref, session, listener) => {
    const dispose = subscribe(ref, session, listener)
    liveListeners += 1
    let disposed = false
    return () => {
      if (!disposed) {
        disposed = true
        liveListeners -= 1
      }
      dispose()
    }
  })
  return {
    dispatcher: new RpcDispatcher({ runtime, methods: TERMINAL_MESSAGE_QUEUE_METHODS }),
    host,
    registry,
    liveListeners: () => liveListeners
  }
}

function socket(connectionId: string) {
  return { clientId: 'phone', clientKind: 'mobile' as const, connectionId }
}

function request(method: string, params: unknown): RpcRequest {
  return { id: `req-${method}`, authToken: 'tok', method, params }
}

beforeEach(() => {
  working = true
})

afterEach(() => {
  vi.useRealTimers()
})

describe('terminalMessageQueue RPC', () => {
  it('is registered, advertised by the host, and open to paired phones', () => {
    expect(RUNTIME_CAPABILITIES).toContain(TERMINAL_MESSAGE_QUEUE_RUNTIME_CAPABILITY)
    expect(RUNTIME_CAPABILITIES).toContain(TERMINAL_MESSAGE_QUEUE_UNSUBSCRIBE_RUNTIME_CAPABILITY)
    for (const name of METHOD_NAMES) {
      expect(ALL_RPC_METHODS.some((method) => method.name === name)).toBe(true)
      expect(isMobileRpcMethodAllowed(name)).toBe(true)
    }
  })

  it('queues mid-turn and answers direct when the agent is idle', async () => {
    const { dispatcher } = createDispatcher()
    const queued = await dispatcher.dispatch(
      request('terminalMessageQueue.submit', { ptyId: 'pty-1', text: 'mid-turn' })
    )
    expect(queued).toMatchObject({ ok: true, result: { disposition: 'queued' } })

    working = false
    const second = createDispatcher()
    const direct = await second.dispatcher.dispatch(
      request('terminalMessageQueue.submit', { terminal: 'term_1', text: 'idle' })
    )
    expect(direct).toMatchObject({ ok: true, result: { disposition: 'direct' } })
  })

  it('edits and removes a queued item', async () => {
    const { dispatcher, host } = createDispatcher()
    const queued = await dispatcher.dispatch(
      request('terminalMessageQueue.submit', { ptyId: 'pty-1', text: 'draft' })
    )
    if (!queued.ok) {
      throw new Error('submit failed')
    }
    const listed = host.list({ ptyId: 'pty-1' })
    const itemId = listed.items[0]?.id ?? ''
    const edited = await dispatcher.dispatch(
      request('terminalMessageQueue.edit', { ptyId: 'pty-1', itemId, text: 'final' })
    )
    expect(edited).toMatchObject({
      ok: true,
      result: { outcome: 'edited', snapshot: { items: [{ text: 'final' }] } }
    })
    const removed = await dispatcher.dispatch(
      request('terminalMessageQueue.remove', { ptyId: 'pty-1', itemId })
    )
    expect(removed).toMatchObject({ ok: true, result: { snapshot: { items: [] } } })
  })

  it('rejects a call that names no terminal', async () => {
    const { dispatcher } = createDispatcher()
    const response = await dispatcher.dispatch(request('terminalMessageQueue.list', {}))
    expect(response.ok).toBe(false)
  })

  it('streams a snapshot on subscribe and ends when the transport aborts', async () => {
    const { dispatcher } = createDispatcher()
    const frames: unknown[] = []
    const controller = new AbortController()
    await dispatcher.dispatchStreaming(
      request('terminalMessageQueue.subscribe', { ptyId: 'pty-1' }),
      (frame) => frames.push(JSON.parse(frame)),
      { signal: controller.signal }
    )
    expect(frames[0]).toMatchObject({ ok: true, result: { type: 'snapshot' } })
    controller.abort()
    expect(frames.at(-1)).toMatchObject({ result: { type: 'end' } })
  })

  async function open(
    dispatcher: RpcDispatcher,
    frameId: string,
    connectionId: string,
    frames: unknown[] = []
  ): Promise<unknown[]> {
    await dispatcher.dispatchStreaming(
      {
        id: frameId,
        authToken: 'tok',
        method: 'terminalMessageQueue.subscribe',
        params: { terminal: 'term_1', capabilities: { unsubscribe: 1 } }
      },
      (frame) => frames.push(JSON.parse(frame)),
      socket(connectionId)
    )
    return frames
  }

  it('drops the listener a client unsubscribes and keeps its sibling on the same socket', async () => {
    const { dispatcher, liveListeners } = createDispatcher()
    const ended = await open(dispatcher, 'frame-a', 'socket-1')
    const kept = await open(dispatcher, 'frame-b', 'socket-1')
    expect(liveListeners()).toBe(2)

    const reply = await dispatcher.dispatch(
      request('terminalMessageQueue.unsubscribe', { subscriptionId: 'frame-a' }),
      socket('socket-1')
    )
    expect(reply).toMatchObject({ ok: true, result: { unsubscribed: true } })
    expect(liveListeners()).toBe(1)
    expect(ended.at(-1)).toMatchObject({ result: { type: 'end' } })
    expect(kept.at(-1)).not.toMatchObject({ result: { type: 'end' } })
  })

  it('cannot end a stream another socket owns', async () => {
    const { dispatcher, liveListeners } = createDispatcher()
    await open(dispatcher, 'frame-a', 'socket-1')
    await dispatcher.dispatch(
      request('terminalMessageQueue.unsubscribe', { subscriptionId: 'frame-a' }),
      socket('socket-2')
    )
    expect(liveListeners()).toBe(1)
  })

  it('drops every listener a socket carried when it closes', async () => {
    const { dispatcher, registry, liveListeners } = createDispatcher()
    await open(dispatcher, 'frame-a', 'socket-1')
    await open(dispatcher, 'frame-b', 'socket-1')
    await open(dispatcher, 'frame-c', 'socket-2')
    expect(liveListeners()).toBe(3)

    registry.cleanupSubscriptionsForConnection('socket-1')
    expect(liveListeners()).toBe(1)
  })

  it('answers an unsubscribe for a stream that already ended', async () => {
    const { dispatcher } = createDispatcher()
    const reply = await dispatcher.dispatch(
      request('terminalMessageQueue.unsubscribe', { subscriptionId: 'gone' }),
      socket('socket-1')
    )
    expect(reply).toMatchObject({ ok: true, result: { unsubscribed: true } })
  })
})
