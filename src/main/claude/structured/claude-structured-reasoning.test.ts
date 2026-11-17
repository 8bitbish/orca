import { describe, expect, it, vi } from 'vitest'
import type { AgentJournalItemBody } from '../../../shared/agent-session/journal/agent-session-journal-types'
import { agentJournalItemKey } from '../../../shared/agent-session/journal/agent-session-journal-item-key'
import { createClaudeJournalTranslator } from './journal/claude-structured-journal-translation'

function setup() {
  const rows = new Map<string, AgentJournalItemBody>()
  const translator = createClaudeJournalTranslator({
    sink: {
      appendItem: (identity, body) => {
        if (body.kind !== 'turn') {
          rows.set(agentJournalItemKey(identity), body)
        }
      },
      appendTombstone: vi.fn(),
      publish: vi.fn()
    }
  })
  const frame = (message: Record<string, unknown>, observedAt?: number): void =>
    translator.handle({
      type: 'message',
      sessionId: 'orca-session',
      ...(observedAt === undefined ? {} : { observedAt }),
      message: {
        session_id: 'session',
        parent_tool_use_id: null,
        ...message
      }
    })
  const stream = (uuid: string, event: Record<string, unknown>, observedAt?: number): void =>
    frame({ type: 'stream_event', uuid, event }, observedAt)
  const final = (uuid: string, content: unknown[], observedAt?: number): void =>
    frame(
      {
        type: 'assistant',
        uuid,
        message: { id: 'message-1', role: 'assistant', content }
      },
      observedAt
    )
  return { rows, translator, frame, stream, final }
}

function reasoning(text: string, lifecycle: Record<string, unknown>): AgentJournalItemBody {
  return {
    kind: 'message',
    role: 'reasoning',
    blocks: [{ type: 'text', text }],
    ...lifecycle
  }
}

describe('structured Claude reasoning', () => {
  // Personal build: blank thinking still journals, as the row "Thought for Ns" reads.
  it.each(['', ' ', '\n\t'])('journals blank final thinking %j as a thought marker', (thinking) => {
    const { rows, final, translator } = setup()
    final('final-only', [{ type: 'thinking', thinking }])
    expect([...rows.values()]).toEqual([reasoning('', { state: 'completed' })])
    translator.dispose()
  })

  it('reconciles an empty final block before the next thinking block', () => {
    const { rows, stream, final, translator } = setup()
    stream('empty-start', {
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'thinking', thinking: '' }
    })
    final('empty-final', [{ type: 'thinking', thinking: '' }])
    stream('next-start', {
      type: 'content_block_start',
      index: 1,
      content_block: { type: 'thinking', thinking: 'Next thought' }
    })
    translator.flush()
    const key = [...rows.keys()][0]
    final('next-final', [{ type: 'thinking', thinking: 'Next thought' }])
    // Personal build: the empty block keeps its own thought marker row ahead of the next one.
    expect([...rows.keys()]).toEqual([key, expect.any(String)])
    expect([...rows.values()].map((row) => row.kind === 'message' && row.blocks)).toEqual([
      [{ type: 'text', text: '' }],
      [{ type: 'text', text: 'Next thought' }]
    ])
    expect(translator.pendingStreamedBlocks).toBe(0)
    translator.dispose()
  })
})
