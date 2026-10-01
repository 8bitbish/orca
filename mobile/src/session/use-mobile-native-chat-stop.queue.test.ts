import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RpcClient } from '../transport/rpc-client'
import { useMobileNativeChatStop } from './use-mobile-native-chat-stop'

vi.mock('../terminal/worker-terminal-takeover-report', () => ({
  reportWorkerTerminalUserInput: vi.fn()
}))

// Stop on a host that holds the queue: the host writes the interrupt and sends the next item.
describe('useMobileNativeChatStop with the host queue', () => {
  let renderer: ReactTestRenderer | null = null
  let stop: (() => void) | null = null
  const sendRequest = vi.fn()
  const onSendError = vi.fn()
  const cancelPending = vi.fn()
  const client: RpcClient = {
    sendRequest,
    subscribe: () => () => {},
    updateTerminalSubscriptionViewport: () => {},
    getState: () => 'connected',
    getReconnectAttempt: () => 0,
    getLastConnectedAt: () => null,
    onStateChange: () => () => {},
    notifyForeground: () => {},
    close: () => {}
  }

  beforeEach(() => {
    vi.useFakeTimers()
    sendRequest.mockReset().mockResolvedValue({ ok: true, result: { send: { accepted: true } } })
    onSendError.mockReset()
    cancelPending.mockReset()
  })

  afterEach(() => {
    act(() => renderer?.unmount())
    renderer = null
    stop = null
    vi.useRealTimers()
  })

  async function mount(hostStop: (() => Promise<'host' | 'fallback' | 'unknown'>) | null) {
    function Harness(): null {
      stop = useMobileNativeChatStop({
        client,
        enabled: true,
        handleRef: { current: 'terminal-1' },
        deviceTokenRef: { current: 'mobile-1' },
        streamIdentity: 'stream-1',
        cancelPending,
        onSendError,
        hostStop
      })
      return null
    }
    await act(async () => {
      renderer = create(createElement(Harness))
    })
  }

  async function pressStop(): Promise<void> {
    await act(async () => {
      stop?.()
      await vi.runAllTimersAsync()
    })
  }

  it('lets the host stop the turn and writes no Escape of its own', async () => {
    const hostStop = vi.fn(async () => 'host' as const)
    await mount(hostStop)
    await pressStop()
    expect(cancelPending).toHaveBeenCalledTimes(1)
    expect(hostStop).toHaveBeenCalledTimes(1)
    expect(sendRequest).not.toHaveBeenCalled()
    expect(onSendError).not.toHaveBeenCalled()
  })

  it('writes the paced Escapes when the host did nothing', async () => {
    await mount(async () => 'fallback')
    await pressStop()
    expect(sendRequest).toHaveBeenCalledTimes(2)
    expect(sendRequest.mock.calls[0]?.[1]).toMatchObject({ terminal: 'terminal-1', text: '\x1b' })
  })

  it('reports an unconfirmed Stop and does not interrupt twice', async () => {
    await mount(async () => 'unknown')
    await pressStop()
    expect(sendRequest).not.toHaveBeenCalled()
    expect(onSendError).toHaveBeenCalledWith('Stop unconfirmed — check chat before retrying')
  })

  it('keeps the two Escapes on a host without the queue', async () => {
    await mount(null)
    await pressStop()
    expect(sendRequest).toHaveBeenCalledTimes(2)
  })
})
