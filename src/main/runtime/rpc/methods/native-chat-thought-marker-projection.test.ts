import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AgentJournalRenderItem } from '../../../../shared/agent-session-journal-types'
import type { AgentSessionHistoryPage } from '../../../../shared/agent-session-wire'
import type { NativeChatMessage } from '../../../../shared/native-chat-types'
import { AGENT_SESSION_THOUGHT_MARKER_CAPABILITY } from '../../../../shared/protocol-version'
import type { AgentSessionSubscribeInput } from '../../../native-chat/agent-session-wire/structured-agent-session-subscribers'
import {
  call,
  clearStructuredHostStub,
  hostCalls,
  installStructuredHostStub,
  SESSION,
  STRUCTURED_CLIENT
} from './structured-agent-session-rpc.test-fixture'
import { projectThoughtMarkerMessages } from './native-chat-thought-marker-projection'

beforeEach(installStructuredHostStub)
afterEach(clearStructuredHostStub)

function item(itemId: string, sequence: number, text: string): AgentJournalRenderItem {
  return {
    itemId,
    revision: 1,
    sequence,
    observedAt: sequence,
    body: { kind: 'message', role: 'reasoning', blocks: [{ type: 'text', text }] }
  }
}

const USER: AgentJournalRenderItem = {
  itemId: 'user-1',
  revision: 1,
  sequence: 1,
  observedAt: 1,
  body: { kind: 'message', role: 'user', blocks: [{ type: 'text', text: 'hi' }] }
}
const MARKER = item('thought-empty', 2, '')
const THOUGHT = item('thought-text', 3, 'Considering the request.')
const CURRENT_CLIENT = {
  ...STRUCTURED_CLIENT,
  clientCapabilities: [
    ...STRUCTURED_CLIENT.clientCapabilities,
    AGENT_SESSION_THOUGHT_MARKER_CAPABILITY
  ]
}

function batchItems(event: unknown): unknown {
  if (typeof event !== 'object' || event === null || !('batch' in event)) {
    return null
  }
  const { batch } = event
  return typeof batch === 'object' && batch !== null && 'items' in batch ? batch.items : null
}

function page(items: AgentJournalRenderItem[]): AgentSessionHistoryPage {
  return {
    sessionId: SESSION,
    epoch: 'a',
    direction: 'tail',
    items,
    removedItemIds: [],
    submissions: [],
    window: { oldest: null, newest: null, nextCursor: { epoch: 'a', sequence: 3 } },
    hasOlder: false,
    hasNewer: false
  }
}

describe('thought markers at the agent-session RPC boundary', () => {
  it.each([
    ['client that predates them', STRUCTURED_CLIENT, [USER, THOUGHT]],
    ['current client', CURRENT_CLIENT, [USER, MARKER, THOUGHT]],
    ['in-process reader', undefined, [USER, MARKER, THOUGHT]]
  ] as const)('pages history for a %s', async (_label, client, expected) => {
    hostCalls.history.mockReturnValue({ ok: true, page: page([USER, MARKER, THOUGHT]) })
    const reply = await call(
      'agentSession.history',
      { sessionId: SESSION, direction: 'tail' },
      client
    )
    expect(reply).toMatchObject({ ok: true, result: { page: { items: expected } } })
    // The page cursor is untouched, so a client resumes exactly where the host is.
    expect(reply).toMatchObject({
      result: { page: { window: { nextCursor: { epoch: 'a', sequence: 3 } } } }
    })
  })

  it('leaves them out of a live batch only for a client that predates them', async () => {
    hostCalls.subscribe.mockImplementation((input: AgentSessionSubscribeInput) => {
      input.emit({
        type: 'batch',
        sessionId: SESSION,
        fence: 1,
        batch: {
          cursor: { epoch: 'a', sequence: 3 },
          items: [MARKER, THOUGHT],
          removedItemIds: [],
          submissions: []
        }
      })
      return () => {}
    })
    for (const [client, expected] of [
      [STRUCTURED_CLIENT, [THOUGHT]],
      [CURRENT_CLIENT, [MARKER, THOUGHT]]
    ] as const) {
      const reply = await call('agentSession.subscribe', { sessionId: SESSION }, client)
      expect(reply.ok ? batchItems(reply.result) : null).toEqual(expected)
    }
  })
})

describe('thought markers on the transcript RPC', () => {
  const messages: NativeChatMessage[] = [
    {
      id: 'u',
      role: 'user',
      blocks: [{ type: 'text', text: 'hi' }],
      timestamp: 1,
      source: 'transcript'
    },
    {
      id: 't',
      role: 'reasoning',
      blocks: [{ type: 'text', text: '' }],
      timestamp: 2,
      source: 'transcript'
    },
    {
      id: 'a',
      role: 'assistant',
      blocks: [{ type: 'text', text: '' }],
      timestamp: 3,
      source: 'transcript'
    }
  ]

  it('drops only empty reasoning rows, and only for a client that predates them', () => {
    expect(projectThoughtMarkerMessages(messages, STRUCTURED_CLIENT).map((m) => m.id)).toEqual([
      'u',
      'a'
    ])
    expect(projectThoughtMarkerMessages(messages, CURRENT_CLIENT)).toBe(messages)
    expect(projectThoughtMarkerMessages(messages, {})).toBe(messages)
  })
})
