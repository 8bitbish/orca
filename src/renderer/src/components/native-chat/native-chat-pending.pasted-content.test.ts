import { describe, expect, it } from 'vitest'
import type { NativeChatMessage } from '../../../../shared/native-chat-types'
import {
  pendingSendsAsMessages,
  prunePendingSends,
  type NativeChatPendingSend
} from '../../../../shared/native-chat-pending-sends'

function userMessage(id: string, text: string, timestamp = 1): NativeChatMessage {
  return { id, role: 'user', blocks: [{ type: 'text', text }], timestamp, source: 'transcript' }
}

function assistantMessage(id: string, text: string, timestamp = 2): NativeChatMessage {
  return {
    id,
    role: 'assistant',
    blocks: [{ type: 'text', text }],
    timestamp,
    source: 'transcript'
  }
}

const pendingOf = (id: string, text: string): NativeChatPendingSend => ({ id, text, sentAt: 100 })

describe('prunePendingSends with Claude Code pasted content', () => {
  it('drops a large paste once its <pasted_content>-wrapped turn advances', () => {
    // Shape recorded by Claude Code 2.1.285 for a multi-line draft sent as one bracketed paste.
    const draft =
      '\n\n\n\nCommand\nPlease clean up my old checkout.\n\nAt the end, show me what is left.'
    const pending = [pendingOf('p1', draft)]
    const next = prunePendingSends(pending, [
      userMessage('m1', `\n\n<pasted_content id="74c5">\n${draft}\n</pasted_content id="74c5">\n`),
      assistantMessage('m2', 'checking')
    ])
    expect(next).toEqual([])
  })

  it('drops a large paste Claude Code split into several <pasted_content> blocks', () => {
    // Claude Code wraps each ~1KB PTY read separately, cutting words, and leaves the tail bare.
    const draft = 'first part and where I can quickly review and go through them?'
    const recorded =
      '\n\n<pasted_content id="87ce">\nfirst part and\n</pasted_content id="87ce">\n\n' +
      '\n<pasted_content id="87ce">\n where I can quickly revie\n</pasted_content id="87ce">\n\n' +
      'w and go through them?'
    const next = prunePendingSends(
      [pendingOf('p1', draft)],
      [userMessage('m1', recorded), assistantMessage('m2', 'makes sense')]
    )
    expect(next).toEqual([])
  })
})

describe('pendingSendsAsMessages for pasted and queued sends', () => {
  it('hides a large paste while its <pasted_content>-wrapped turn is visible', () => {
    const pending = [pendingOf('p1', 'line one\nline two')]
    const wrapped =
      '\n\n<pasted_content id="82ea">\nline one\nline two\n</pasted_content id="82ea">\n'

    expect(pendingSendsAsMessages(pending, [userMessage('u1', wrapped)])).toEqual([])
  })

  // The id prefix is what the sort reads to decide whether the streaming reply
  // belongs above this echo (it answers it) or below it (the echo is queued).
  it('marks a send issued while the agent was already replying as queued', () => {
    const idle = pendingOf('p1', 'first')
    const queued = { ...pendingOf('p2', 'second'), queuedWhileWorking: true }

    expect(pendingSendsAsMessages([idle, queued], []).map((m) => m.id)).toEqual([
      'pending:p1',
      'pending-queued:p2'
    ])
  })
})
