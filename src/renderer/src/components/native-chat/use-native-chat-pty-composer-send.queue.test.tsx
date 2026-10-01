// @vitest-environment happy-dom
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NativeChatComposerQueue } from './native-chat-composer-types'

const sendNativeChatMessage = vi.fn((..._args: unknown[]) => ({
  cancel: vi.fn(),
  settleAfterMs: 0
}))

vi.mock('./native-chat-runtime-send', () => ({
  sendNativeChatMessage: (...args: unknown[]) => sendNativeChatMessage(...args),
  sendNativeChatTypedCommand: vi.fn(),
  submitNativeChatPrompt: vi.fn()
}))
vi.mock('./native-chat-runtime-image-send', () => ({
  sendNativeChatMessageWithImageAttachments: vi.fn()
}))
vi.mock('@/lib/native-chat-telemetry', () => ({ emitNativeChatMessageSent: vi.fn() }))
vi.mock('../../store', () => ({
  useAppStore: { getState: () => ({ clearNativeChatLaunchDraft: vi.fn() }) }
}))

import { useNativeChatPtyComposerSend } from './use-native-chat-pty-composer-send'

function harness(draft: string, queue: NativeChatComposerQueue | null) {
  const setDraft = vi.fn()
  const onOptimisticSend = vi.fn(() => 'pending-1')
  const { result } = renderHook(() =>
    useNativeChatPtyComposerSend({
      agent: 'claude',
      draft,
      imageAttachments: [],
      disabled: false,
      isDispatchingSessionOption: false,
      launchDraftResolved: true,
      resolveTarget: () => ({ ptyId: 'pty-1', settings: null }),
      classifySend: () => 'chat',
      onOptimisticSend,
      sessionOptionsSurface: null,
      terminalTabId: 'tab-1',
      trackPendingSend: vi.fn(),
      setHistory: vi.fn(),
      setDraft,
      setCaret: vi.fn(),
      clearSkillOrigin: vi.fn(),
      clearImageAttachments: vi.fn(),
      setNotice: vi.fn(),
      queue
    })
  )
  return { send: result.current, setDraft, onOptimisticSend }
}

beforeEach(() => {
  sendNativeChatMessage.mockClear()
})

describe('PTY composer send with a host message queue', () => {
  it('sends straight to the terminal when the host has no queue (old host)', () => {
    const { send, onOptimisticSend } = harness('hello', null)
    expect(send()).toBe(true)
    expect(sendNativeChatMessage).toHaveBeenCalledTimes(1)
    expect(onOptimisticSend).toHaveBeenCalledWith('hello', [])
  })

  it('sends straight away when the host says the main agent is idle', () => {
    const enqueue = vi.fn()
    const { send } = harness('hello', { willQueue: false, enqueue })
    send()
    expect(enqueue).not.toHaveBeenCalled()
    expect(sendNativeChatMessage).toHaveBeenCalledTimes(1)
  })

  it('hands a mid-turn send to the host and clears the draft without typing it', async () => {
    const enqueue = vi.fn(async () => 'queued' as const)
    const { send, setDraft, onOptimisticSend } = harness('later', { willQueue: true, enqueue })
    expect(send()).toBe(true)
    expect(enqueue).toHaveBeenCalledWith('later', [])
    expect(setDraft).toHaveBeenCalledWith('')
    await Promise.resolve()
    expect(sendNativeChatMessage).not.toHaveBeenCalled()
    expect(onOptimisticSend).not.toHaveBeenCalled()
  })

  it('falls back to the direct send when the host answers direct or cannot hold it', async () => {
    for (const outcome of ['direct', 'failed', 'refused'] as const) {
      sendNativeChatMessage.mockClear()
      const enqueue = vi.fn(async () => outcome)
      const { send } = harness('now', { willQueue: true, enqueue })
      send()
      await vi.waitFor(() => expect(sendNativeChatMessage).toHaveBeenCalledTimes(1))
    }
  })
})
