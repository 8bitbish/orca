// The composer send on a host that holds mid-turn prompts (terminal.message-queue.v1), and the
// unchanged path on a host without one.

import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MobileQueueSubmitOutcome } from './use-mobile-native-chat-message-queue'

const sendWithOutcome = vi.fn()
const clearInputWrite = vi.fn()
const heal = vi.fn()
vi.mock('./mobile-native-chat-send', () => ({
  sendMobileNativeChatMessageWithOutcome: (...args: unknown[]) => sendWithOutcome(...args),
  typeMobileNativeChatCommandWithOutcome: vi.fn(),
  clearMobileNativeChatInput: (...args: unknown[]) => clearInputWrite(...args),
  openMobileNativeChatSendBudget: () => Date.now() + 15_000,
  MOBILE_NATIVE_CHAT_SEND_TIMEOUT_MS: 15_000,
  MOBILE_NATIVE_CHAT_MIN_WRITE_TIMEOUT_MS: 2_000
}))
vi.mock('./mobile-native-chat-stale-input', () => ({
  healMobileNativeChatStaleInput: (...args: unknown[]) => heal(...args)
}))

import { useMobileNativeChatMessageSend } from './use-mobile-native-chat-message-send'

type Send = ReturnType<typeof useMobileNativeChatMessageSend>

describe('useMobileNativeChatMessageSend with a host queue', () => {
  let renderer: ReactTestRenderer | null = null
  let api: Send | null = null
  const origin = { draftKey: 'k', pendingKey: 'p' }
  const acceptSend = vi.fn()
  const captureSendOrigin = vi.fn(() => origin as never)
  const clearDraftForSend = vi.fn()
  const restoreRejectedDraft = vi.fn()
  const onSendError = vi.fn()
  const queueSubmit = vi.fn<(text: string) => Promise<MobileQueueSubmitOutcome>>()

  const mount = (queue: typeof queueSubmit | null): void => {
    function Probe(): null {
      api = useMobileNativeChatMessageSend({
        client: { sendRequest: vi.fn() } as never,
        enabled: true,
        handleRef: { current: 'term' },
        deviceTokenRef: { current: 'device' },
        agentRef: { current: 'claude' },
        commandSendRef: { current: vi.fn() },
        agentWorkingRef: { current: true },
        captureSendOrigin,
        readSeededLaunchDraftSeed: () => null,
        clearDraftForSend,
        restoreRejectedDraft,
        acceptSend,
        holdUnconfirmedSend: vi.fn(),
        onSendError,
        queueSubmit: queue
      })
      return null
    }
    act(() => {
      renderer = create(createElement(Probe))
    })
  }

  const send = async (text: string): Promise<boolean | undefined> => {
    let accepted: boolean | undefined
    await act(async () => {
      accepted = await api?.send(text)
    })
    return accepted
  }

  beforeEach(() => {
    for (const mock of [
      sendWithOutcome,
      clearInputWrite,
      heal,
      acceptSend,
      clearDraftForSend,
      restoreRejectedDraft,
      onSendError,
      queueSubmit
    ]) {
      mock.mockReset()
    }
    sendWithOutcome.mockResolvedValue('accepted')
    clearInputWrite.mockResolvedValue(true)
    heal.mockResolvedValue(true)
  })
  afterEach(() => {
    act(() => renderer?.unmount())
    renderer = null
    api = null
  })

  it('hands a mid-turn send to the host and echoes nothing until it is delivered', async () => {
    queueSubmit.mockResolvedValue('queued')
    mount(queueSubmit)
    expect(await send('next question  ')).toBe(true)
    expect(queueSubmit).toHaveBeenCalledWith('next question', undefined)
    expect(clearDraftForSend).toHaveBeenCalledWith(origin, 'next question  ')
    expect(sendWithOutcome).not.toHaveBeenCalled()
    expect(clearInputWrite).not.toHaveBeenCalled()
    expect(heal).not.toHaveBeenCalled()
    expect(acceptSend).not.toHaveBeenCalled()
    expect(restoreRejectedDraft).not.toHaveBeenCalled()
  })

  it('sends the way it always did when the host answers direct', async () => {
    queueSubmit.mockResolvedValue('direct')
    mount(queueSubmit)
    expect(await send('hello')).toBe(true)
    expect(queueSubmit).toHaveBeenCalledTimes(1)
    expect(sendWithOutcome).toHaveBeenCalledTimes(1)
    expect(sendWithOutcome.mock.calls[0]![0]).toMatchObject({ terminal: 'term', text: 'hello' })
    expect(acceptSend).toHaveBeenCalledWith(origin, 'hello', undefined, true)
    expect(restoreRejectedDraft).not.toHaveBeenCalled()
  })

  it('falls back to a direct send when the host refused the queue call outright', async () => {
    queueSubmit.mockResolvedValue('unavailable')
    mount(queueSubmit)
    expect(await send('hello')).toBe(true)
    expect(sendWithOutcome).toHaveBeenCalledTimes(1)
  })

  it('never types a send whose queue reply was lost, and gives the text back', async () => {
    queueSubmit.mockResolvedValue('unknown')
    mount(queueSubmit)
    expect(await send('maybe queued')).toBe(false)
    expect(sendWithOutcome).not.toHaveBeenCalled()
    expect(restoreRejectedDraft).toHaveBeenCalledWith(origin, 'maybe queued')
    expect(onSendError).toHaveBeenCalledWith('Queue unconfirmed — check the queue before resending')
  })

  it('reports a full queue and restores the draft', async () => {
    queueSubmit.mockResolvedValue('queue-full')
    mount(queueSubmit)
    expect(await send('one more')).toBe(false)
    expect(sendWithOutcome).not.toHaveBeenCalled()
    expect(restoreRejectedDraft).toHaveBeenCalledWith(origin, 'one more')
    expect(onSendError).toHaveBeenCalledWith('Message not sent (queue is full)')
  })

  it('puts the draft back when the direct send that follows cannot heal the input', async () => {
    queueSubmit.mockResolvedValue('direct')
    heal.mockResolvedValue(false)
    mount(queueSubmit)
    expect(await send('hello')).toBe(false)
    expect(restoreRejectedDraft).toHaveBeenCalledWith(origin, 'hello')
  })

  it('keeps slash commands and question answers off the queue', async () => {
    queueSubmit.mockResolvedValue('queued')
    mount(queueSubmit)
    await send('/compact')
    await act(async () => {
      await api?.answerQuestion('yes')
    })
    expect(queueSubmit).not.toHaveBeenCalled()
    expect(sendWithOutcome).toHaveBeenCalledTimes(2)
  })

  it('keeps the old path on a host without the queue', async () => {
    mount(null)
    expect(await send('hello')).toBe(true)
    expect(queueSubmit).not.toHaveBeenCalled()
    expect(clearDraftForSend).toHaveBeenCalledTimes(1)
    expect(sendWithOutcome).toHaveBeenCalledTimes(1)
    expect(acceptSend).toHaveBeenCalledWith(origin, 'hello', undefined, true)
  })
})
