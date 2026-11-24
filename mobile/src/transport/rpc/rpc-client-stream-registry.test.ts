import { describe, expect, it } from 'vitest'
import { RpcClientStreamRegistry } from './rpc-client-stream-registry'
import type { ConnectionState } from '../connection/connection-state'

type SentRequest = {
  id: string
  method: string
  params?: unknown
}

function createRegistry(initialState: ConnectionState = 'connected') {
  const sent: SentRequest[] = []
  let state = initialState
  let id = 0
  const registry = new RpcClientStreamRegistry({
    nextId: () => `rpc-${++id}`,
    getState: () => state,
    sendFrame: (request) => {
      if (state !== 'connected') {
        return false
      }
      sent.push(request)
      return true
    }
  })
  return {
    registry,
    sent,
    setState(next: ConnectionState) {
      state = next
    }
  }
}

describe('RpcClientStreamRegistry', () => {
  it('ends one terminal queue stream by its frame id, leaving a sibling on the same socket', () => {
    const { registry, sent } = createRegistry()
    const params = { terminal: 'term-1', capabilities: { unsubscribe: 1 } }
    const disposeFirst = registry.subscribe('terminalMessageQueue.subscribe', params, () => {})
    registry.subscribe(
      'terminalMessageQueue.subscribe',
      { ...params, terminal: 'term-2' },
      () => {}
    )
    const [first] = sent

    disposeFirst()
    expect(sent.at(-1)).toMatchObject({
      method: 'terminalMessageQueue.unsubscribe',
      params: { subscriptionId: first!.id }
    })
    expect(sent.filter((r) => r.method === 'terminalMessageQueue.unsubscribe')).toHaveLength(1)
  })

  it('sends no queue unsubscribe for a subscribe made against a host that lacks it', () => {
    const { registry, sent } = createRegistry()
    const dispose = registry.subscribe(
      'terminalMessageQueue.subscribe',
      { terminal: 'term-1' },
      () => {}
    )

    dispose()
    expect(sent.map((request) => request.method)).toEqual(['terminalMessageQueue.subscribe'])
  })
})
