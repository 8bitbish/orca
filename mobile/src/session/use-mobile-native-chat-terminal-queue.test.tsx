import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NativeChatMessage } from '../../../src/shared/native-chat-types'
import type {
  TerminalMessageQueueSnapshot,
  TerminalQueuedMessage
} from '../../../src/shared/terminal-message-queue-contract'
import type { RpcClient } from '../transport/rpc-client'
import type { MobileNativeChatSendOrigin } from './mobile-native-chat-pending-echo'
import { clearMobileQueueOrphansForTests } from './mobile-terminal-message-queue-orphans'
import { clearQueuedImagePreviewsForTests } from './mobile-terminal-message-queue-previews'
import { useMobileNativeChatTerminalQueue } from './use-mobile-native-chat-terminal-queue'

function item(id: string, text: string, extra: Partial<TerminalQueuedMessage> = {}) {
  return { id, text, queuedAt: 10_000, state: 'queued' as const, ...extra }
}

function snap(revision: number, items: TerminalQueuedMessage[]): TerminalMessageQueueSnapshot {
  return { revision, lead: 'working', interrupting: false, terminal: 'live', items }
}

function sendOrigin(text: string, baselineTailMessageId: string): MobileNativeChatSendOrigin {
  return {
    draftKey: 'draft',
    draftEditGeneration: 0,
    pendingKey: null,
    normalizedText: text,
    baselineOccurrences: 0,
    baselineTailMessageId,
    baselineResolved: true
  }
}

function userMessage(id: string, text: string, timestamp: number): NativeChatMessage {
  return { id, role: 'user', blocks: [{ type: 'text', text }], timestamp, source: 'transcript' }
}

/** Only the two calls the queue makes do anything; the rest of the client is inert. */
function queueTestClient(parts: Pick<RpcClient, 'sendRequest' | 'subscribe'>): RpcClient {
  return {
    ...parts,
    updateTerminalSubscriptionViewport: () => {},
    getState: () => 'connected',
    getReconnectAttempt: () => 0,
    getLastConnectedAt: () => null,
    onStateChange: () => () => {},
    notifyForeground: () => {},
    close: () => {}
  }
}

type Result = ReturnType<typeof useMobileNativeChatTerminalQueue>

describe('useMobileNativeChatTerminalQueue', () => {
  let renderer: ReactTestRenderer | null = null
  let result: Result | null = null
  let streamListener: ((frame: unknown) => void) | null = null
  let composer = ''
  const acceptSend = vi.fn()
  const clearDraftForSend = vi.fn()
  const onSendError = vi.fn()
  let tail = 'm0'
  const captureSendOrigin = vi.fn((text: string) => sendOrigin(text, tail))
  const sendRequest = vi.fn()
  const client = queueTestClient({
    sendRequest,
    subscribe: (_method, _params, onData) => {
      streamListener = onData
      return () => {
        streamListener = null
      }
    }
  })

  function Harness({ messages }: { messages: NativeChatMessage[] }): null {
    result = useMobileNativeChatTerminalQueue({
      client,
      supported: true,
      resolution: { agent: 'claude', sessionId: 's1', transcriptPath: null },
      terminal: 'term-1',
      scopeKey: 'host\0wt\0tab',
      messages,
      captureSendOrigin,
      acceptSend,
      clearDraftForSend,
      setComposerText: (next) => {
        composer = typeof next === 'function' ? next(composer) : next
      },
      onSendError
    })
    return null
  }

  async function render(messages: NativeChatMessage[] = []): Promise<void> {
    await act(async () => {
      const element = createElement(Harness, { messages })
      if (renderer) {
        renderer.update(element)
      } else {
        renderer = create(element)
      }
    })
  }

  async function emit(frame: unknown): Promise<void> {
    await act(async () => streamListener?.(frame))
  }

  beforeEach(() => {
    vi.useFakeTimers()
    clearMobileQueueOrphansForTests()
    clearQueuedImagePreviewsForTests()
    composer = ''
    tail = 'm0'
    for (const mock of [acceptSend, clearDraftForSend, onSendError, sendRequest]) {
      mock.mockReset()
    }
    captureSendOrigin.mockClear()
  })

  afterEach(() => {
    act(() => renderer?.unmount())
    renderer = null
    result = null
    vi.useRealTimers()
  })

  it('echoes a delivered item against the baseline taken when typing began', async () => {
    await render()
    await emit({ type: 'snapshot', snapshot: snap(1, [item('a', 'queued one')]) })
    await emit({
      type: 'snapshot',
      snapshot: snap(2, [item('a', 'queued one', { state: 'delivering' })])
    })
    // The transcript row lands before the host reports delivery.
    tail = 'm1'
    await emit({ type: 'delivered', item: item('a', 'queued one') })
    expect(acceptSend).toHaveBeenCalledTimes(1)
    expect(acceptSend).toHaveBeenCalledWith(
      sendOrigin('queued one', 'm0'),
      'queued one',
      undefined,
      false
    )
  })

  it('shows the stack only while the host holds something', async () => {
    await render()
    await emit({ type: 'snapshot', snapshot: snap(1, []) })
    expect(result?.stack).toBeNull()
    await emit({ type: 'snapshot', snapshot: snap(2, [item('a', 'one'), item('b', 'two')]) })
    expect(result?.stack?.snapshot.items).toHaveLength(2)
    expect(result?.queue.willQueue).toBe(true)
  })

  it('waits before calling an item lost, and drops it if the transcript shows it was sent', async () => {
    await render()
    await emit({
      type: 'snapshot',
      snapshot: snap(5, [item('a', 'lost one'), item('b', 'sent one')])
    })
    await emit({ type: 'end' })
    await act(async () => {
      vi.advanceTimersByTime(2_000)
    })
    await emit({ type: 'snapshot', snapshot: snap(1, []) })
    expect(result?.stack?.orphans ?? []).toEqual([])
    await render([userMessage('m9', 'sent one', 11_000)])
    await act(async () => {
      vi.advanceTimersByTime(4_000)
    })
    expect(result?.stack?.orphans.map((orphan) => orphan.id)).toEqual(['a'])
  })

  it('restores a lost item to the composer after what is already typed', async () => {
    composer = 'draft'
    await render()
    await emit({ type: 'snapshot', snapshot: snap(5, [item('a', 'lost one')]) })
    await emit({ type: 'end' })
    await act(async () => {
      vi.advanceTimersByTime(2_000)
    })
    await emit({ type: 'snapshot', snapshot: snap(1, []) })
    await act(async () => {
      vi.advanceTimersByTime(4_000)
    })
    await act(async () => result?.stack?.onRestore({ id: 'a', text: 'lost one' }, true))
    expect(composer).toBe('draft\nlost one')
    expect(result?.stack).toBeNull()
  })

  it('restores an unsent host item and removes it from the queue', async () => {
    sendRequest.mockResolvedValue({ id: 'r', ok: true, result: { snapshot: snap(3, []) } })
    await render()
    await emit({
      type: 'snapshot',
      snapshot: snap(2, [
        item('a', 'stuck', { state: 'undeliverable', undeliverableReason: 'exited' })
      ])
    })
    await act(async () => result?.stack?.onRestore({ id: 'a', text: 'stuck' }, false))
    expect(composer).toBe('stuck')
    expect(sendRequest).toHaveBeenCalledWith(
      'terminalMessageQueue.remove',
      { terminal: 'term-1', itemId: 'a' },
      expect.anything()
    )
  })

  it('queues an image send and keeps its previews for the echo', async () => {
    sendRequest.mockResolvedValue({
      id: 'r',
      ok: true,
      result: {
        disposition: 'queued',
        item: item('img', 'look', { imagePaths: ['/host/a.png'] }),
        snapshot: snap(2, [item('img', 'look', { imagePaths: ['/host/a.png'] })])
      }
    })
    await render()
    await emit({ type: 'snapshot', snapshot: snap(1, []) })
    let routed: string | undefined
    await act(async () => {
      routed = await result?.queueImageSend('look', [
        { id: 'i1', path: '/host/a.png', previewUri: 'file:///phone/a.png' }
      ])
    })
    expect(routed).toBe('queued')
    expect(clearDraftForSend).toHaveBeenCalledTimes(1)
    await emit({ type: 'delivered', item: item('img', 'look', { imagePaths: ['/host/a.png'] }) })
    expect(acceptSend).toHaveBeenCalledWith(
      expect.anything(),
      'look',
      ['file:///phone/a.png'],
      false
    )
  })
})
