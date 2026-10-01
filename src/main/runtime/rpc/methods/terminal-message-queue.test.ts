import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RpcDispatcher } from '../dispatcher'
import type { RpcRequest } from '../core'
import type { OrcaRuntimeService } from '../../orca-runtime'
import { MOBILE_RPC_METHOD_ALLOWLIST } from '../../runtime-rpc/runtime-rpc-mobile-method-allowlist'
import {
  RUNTIME_CAPABILITIES,
  TERMINAL_MESSAGE_QUEUE_RUNTIME_CAPABILITY
} from '../../../../shared/protocol-version'
import { TerminalMessageQueueHost } from '../../../terminal-message-queue/terminal-message-queue-host'
import { ALL_RPC_METHODS } from './index'
import { TERMINAL_MESSAGE_QUEUE_METHODS } from './terminal-message-queue'

const METHOD_NAMES = [
  'terminalMessageQueue.submit',
  'terminalMessageQueue.list',
  'terminalMessageQueue.remove',
  'terminalMessageQueue.edit',
  'terminalMessageQueue.stop',
  'terminalMessageQueue.sendNext',
  'terminalMessageQueue.subscribe'
]

let working = true

function createDispatcher(): { dispatcher: RpcDispatcher; host: TerminalMessageQueueHost } {
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
  const cleanups = new Map<string, () => void>()
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: these methods read only the queue host, the runtime id and the subscription registry.
  const runtime = {
    getRuntimeId: () => 'test-runtime',
    terminalMessageQueue: host,
    registerSubscriptionCleanup: (id: string, cleanup: () => void) => cleanups.set(id, cleanup),
    cleanupSubscription: (id: string) => {
      const cleanup = cleanups.get(id)
      cleanups.delete(id)
      cleanup?.()
    }
  } as unknown as OrcaRuntimeService
  return {
    dispatcher: new RpcDispatcher({ runtime, methods: TERMINAL_MESSAGE_QUEUE_METHODS }),
    host
  }
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
    for (const name of METHOD_NAMES) {
      expect(ALL_RPC_METHODS.some((method) => method.name === name)).toBe(true)
      expect(MOBILE_RPC_METHOD_ALLOWLIST.has(name)).toBe(true)
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
})
