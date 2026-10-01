import { describe, expect, it, vi } from 'vitest'
import type {
  AgentJournalItemBody,
  AgentJournalItemIdentity
} from '../../shared/agent-session-journal-types'
import type { StructuredAgentSessionEventSink } from '../native-chat/agent-session-wire/structured-agent-session-event-sink'
import { createClaudeJournalTranslator } from './claude-structured-journal-translation'

function sinkState() {
  const items: { identity: AgentJournalItemIdentity; body: AgentJournalItemBody }[] = []
  const sink: StructuredAgentSessionEventSink = {
    appendItem: (identity, body) => items.push({ identity, body }),
    appendTombstone: vi.fn(),
    publish: vi.fn()
  }
  return { sink, items }
}

function message(uuid: string, content: unknown[]) {
  return {
    type: 'message' as const,
    sessionId: 'orca-session',
    message: {
      type: 'assistant',
      uuid,
      session_id: 'claude-session',
      parent_tool_use_id: null,
      message: { role: 'assistant', content }
    }
  }
}

function reasoningBodies(items: { body: AgentJournalItemBody }[]): AgentJournalItemBody[] {
  return items.flatMap((item) =>
    item.body.kind === 'message' && item.body.role === 'reasoning' ? [item.body] : []
  )
}

// Claude Code 2.1.x signs every thinking block and sends it with `thinking: ''`.
describe('Claude thinking with no text', () => {
  it('journals redacted and signed-empty thinking as one thought marker per envelope', () => {
    const state = sinkState()
    const translator = createClaudeJournalTranslator({ sink: state.sink })

    translator.handle(message('assistant-redacted', [{ type: 'redacted_thinking', data: 'Emw' }]))
    translator.handle(
      message('assistant-two-empty', [
        { type: 'thinking', thinking: '', signature: 'sig-a' },
        { type: 'redacted_thinking', data: 'opaque' }
      ])
    )

    expect(reasoningBodies(state.items)).toEqual([
      { kind: 'message', role: 'reasoning', blocks: [{ type: 'text', text: '' }] },
      { kind: 'message', role: 'reasoning', blocks: [{ type: 'text', text: '' }] }
    ])
    // Modeled content: no "Claude sent content Orca cannot display yet" fallback row.
    expect(state.items.some((item) => item.body.kind === 'status')).toBe(false)
  })

  it('keeps the text when a thought has some', () => {
    const state = sinkState()
    const translator = createClaudeJournalTranslator({ sink: state.sink })
    translator.handle(
      message('assistant-mixed', [
        { type: 'thinking', thinking: '', signature: 'sig' },
        { type: 'thinking', thinking: 'Check the parser first.', signature: 'sig' }
      ])
    )
    expect(reasoningBodies(state.items)).toEqual([
      {
        kind: 'message',
        role: 'reasoning',
        blocks: [{ type: 'text', text: 'Check the parser first.' }]
      }
    ])
  })
})
