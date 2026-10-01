import { describe, expect, it } from 'vitest'
import type { AgentJournalItemBody, AgentJournalRenderItem } from './agent-session-journal-types'
import type { NativeChatMessage } from './native-chat-types'
import {
  nativeChatThoughtSeconds,
  nativeChatTranscriptThoughtSeconds
} from './native-chat-thought-duration'

const user: AgentJournalItemBody = {
  kind: 'message',
  role: 'user',
  blocks: [{ type: 'text', text: 'go' }]
}
const thought: AgentJournalItemBody = {
  kind: 'message',
  role: 'reasoning',
  blocks: [{ type: 'text', text: 'hmm' }]
}
const toolCall: AgentJournalItemBody = {
  kind: 'tool-call',
  callId: 'call-1',
  name: 'Bash',
  input: { command: 'ls' },
  state: 'completed'
}

function turn(turnId: string, startedAt?: number): AgentJournalItemBody {
  return {
    kind: 'turn',
    turnId,
    state: 'running',
    ...(startedAt === undefined ? {} : { startedAt })
  }
}

let sequence = 0
function item(
  itemId: string,
  body: AgentJournalItemBody,
  observedAt: number,
  extra: Partial<AgentJournalRenderItem> = {}
): AgentJournalRenderItem {
  sequence += 1
  return { itemId, revision: 1, sequence, observedAt, body, ...extra }
}

describe('nativeChatThoughtSeconds', () => {
  it('measures a turn-opening thought from the host turn start to the thought landing', () => {
    const seconds = nativeChatThoughtSeconds('claude', [
      item('u', user, 1_000),
      item('t', turn('turn-1', 4_000), 4_000),
      item('r', thought, 16_900)
    ])
    expect(seconds.get('r')).toBe(12)
  })

  it('gives no duration to a thought that follows other content in its turn', () => {
    const seconds = nativeChatThoughtSeconds('claude', [
      item('u', user, 1_000),
      item('t', turn('turn-1', 2_000), 2_000),
      item('call', toolCall, 3_000),
      item('r', thought, 30_000)
    ])
    expect(seconds.has('r')).toBe(false)
  })

  it('restarts the clock for each turn and ignores revisions of the open one', () => {
    const seconds = nativeChatThoughtSeconds('claude', [
      item('t1', turn('turn-1', 1_000), 1_000),
      item('a', thought, 3_000),
      item('t1-again', turn('turn-1', 1_000), 1_000),
      item('b', thought, 9_000),
      item('t2', turn('turn-2', 10_000), 10_000),
      item('c', thought, 15_000)
    ])
    expect(seconds.get('a')).toBe(2)
    expect(seconds.has('b')).toBe(false)
    expect(seconds.get('c')).toBe(5)
  })

  it('never derives a duration without a host start, a sane order, or a live row', () => {
    const noStart = nativeChatThoughtSeconds('claude', [
      item('t', turn('turn-1'), 1_000),
      item('r', thought, 5_000)
    ])
    const backwards = nativeChatThoughtSeconds('claude', [
      item('t', turn('turn-1', 9_000), 9_000),
      item('r', thought, 5_000)
    ])
    const recovered = nativeChatThoughtSeconds('claude', [
      item('t', turn('turn-1', 1_000), 1_000),
      item('r', thought, 5_000, { recovered: true, recoveredAt: 6_000 })
    ])
    expect(noStart.size).toBe(0)
    expect(backwards.size).toBe(0)
    expect(recovered.size).toBe(0)
  })

  it('skips subagent rows and status chrome when deciding what came first', () => {
    const seconds = nativeChatThoughtSeconds('claude', [
      item('t', turn('turn-1', 1_000), 1_000),
      item('status', { kind: 'status', text: 'Working…' }, 1_500),
      item('child', thought, 2_000, { agentId: 'child-1' }),
      item('r', thought, 4_000)
    ])
    expect(seconds.has('child')).toBe(false)
    expect(seconds.get('r')).toBe(3)
  })

  // Codex streams reasoning, so its row is stamped when the thought starts.
  it('derives nothing for agents whose reasoning rows are stamped at the start', () => {
    const items = [item('t', turn('turn-1', 1_000), 1_000), item('r', thought, 5_000)]
    expect(nativeChatThoughtSeconds('codex', items).size).toBe(0)
    expect(nativeChatThoughtSeconds('claude', undefined).size).toBe(0)
  })
})

// The shape of a real Claude Code 2.1.286 terminal session: thinking blocks are
// recorded empty, one record per block, each stamped as its block completes.
describe('nativeChatTranscriptThoughtSeconds', () => {
  function row(
    id: string,
    role: NativeChatMessage['role'],
    iso: string,
    text = ''
  ): NativeChatMessage {
    return {
      id,
      role,
      blocks: [{ type: 'text', text }],
      timestamp: Date.parse(iso),
      source: 'transcript'
    }
  }
  const transcript: NativeChatMessage[] = [
    row('u1', 'user', '2026-10-01T05:17:20.918Z', 'this is me testing'),
    row('r1', 'reasoning', '2026-10-01T05:17:22.876Z'),
    row('a1', 'assistant', '2026-10-01T05:17:24.188Z', 'Hi.'),
    row('u2', 'user', '2026-10-01T05:29:06.888Z', 'Draw how a request moves through'),
    row('r2', 'reasoning', '2026-10-01T05:29:13.585Z'),
    {
      id: 'a2',
      role: 'assistant',
      blocks: [{ type: 'tool-call', name: 'Read', input: {} }],
      timestamp: Date.parse('2026-10-01T05:29:14.642Z'),
      source: 'transcript'
    },
    row('tool', 'tool', '2026-10-01T05:29:14.999Z'),
    row('r3', 'reasoning', '2026-10-01T05:29:18.142Z')
  ]

  it("times each turn's first thought from its prompt record, and only that one", () => {
    expect([...nativeChatTranscriptThoughtSeconds('claude', transcript)]).toEqual([
      ['r1', 1],
      ['r2', 6]
    ])
  })

  it('ignores optimistic echoes and agents that stamp a thought as it starts', () => {
    const echoed = transcript.map((message) =>
      message.id === 'u2' ? { ...message, source: 'hook' as const } : message
    )
    expect(nativeChatTranscriptThoughtSeconds('claude', echoed).has('r2')).toBe(false)
    expect(nativeChatTranscriptThoughtSeconds('codex', transcript).size).toBe(0)
  })
})
