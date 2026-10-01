import { describe, expect, it, vi } from 'vitest'
import {
  classifyQueueDeliveryError,
  deliverQueuedMessage,
  QUEUE_CLEAR_INPUT_LINE,
  type QueueDeliveryWriter
} from './terminal-message-queue-delivery'

function writer(): QueueDeliveryWriter & { log: string[] } {
  const log: string[] = []
  return {
    log,
    writeRaw: vi.fn(async (bytes: string) => {
      log.push(`raw:${bytes}`)
    }),
    sendPrompt: vi.fn(async (text: string) => {
      log.push(`prompt:${text}`)
    }),
    submit: vi.fn(async () => {
      log.push('submit')
    }),
    sleep: vi.fn(async () => {})
  }
}

describe('deliverQueuedMessage', () => {
  it('clears the input line, then sends through the verified prompt path', async () => {
    const port = writer()
    expect(await deliverQueuedMessage(port, { text: 'hello' }, 'claude')).toBe('delivered')
    expect(port.log).toEqual([`raw:${QUEUE_CLEAR_INPUT_LINE}`, 'prompt:hello'])
  })

  it('pastes images before the text', async () => {
    const port = writer()
    await deliverQueuedMessage(port, { text: 'see this', imagePaths: ['/tmp/a.png'] }, 'claude')
    expect(port.log[0]).toBe(`raw:${QUEUE_CLEAR_INPUT_LINE}`)
    expect(port.log[1]).toContain('/tmp/a.png')
    expect(port.log.at(-1)).toBe('prompt:see this')
  })

  it('submits an image-only message with Enter', async () => {
    const port = writer()
    await deliverQueuedMessage(port, { text: '', imagePaths: ['/tmp/a.png'] }, 'claude')
    expect(port.log.at(-1)).toBe('submit')
  })

  it('maps runtime refusals onto queue outcomes', async () => {
    const port = writer()
    port.sendPrompt = vi.fn(async () => {
      throw new Error('agent_prompt_blocked')
    })
    expect(await deliverQueuedMessage(port, { text: 'x' }, 'claude')).toBe('dialog')
    expect(classifyQueueDeliveryError(new Error('agent_prompt_stalled'))).toBe('delivered')
    expect(classifyQueueDeliveryError(new Error('terminal_not_writable'))).toBe('unverifiable')
    expect(classifyQueueDeliveryError(new Error('boom'))).toBe('failed')
  })
})
