import { describe, expect, it } from 'vitest'
import type { NativeChatMessage } from './native-chat-types'
import {
  nativeChatLatestTurnId,
  nativeChatTranscriptSettledTurns
} from './transcript/turns/native-chat-terminal-turn'

function row(
  id: string,
  role: NativeChatMessage['role'],
  timestamp: number | null
): NativeChatMessage {
  return { id, role, blocks: [{ type: 'text', text: id }], timestamp, source: 'transcript' }
}

function notification(id: string, timestamp: number): NativeChatMessage {
  return {
    ...row(id, 'user', timestamp),
    blocks: [{ type: 'text', text: '<task-notification>\n<task-id>b1</task-id>' }]
  }
}

describe('nativeChatTranscriptSettledTurns', () => {
  // A reminder is user-role in the transcript but lands mid-turn: it is not a prompt.
  it('times a turn across a harness reminder injected mid-turn', () => {
    const settled = nativeChatTranscriptSettledTurns([
      row('u1', 'user', 0),
      row('a1', 'assistant', 5_000),
      {
        ...row('notice', 'user', 10_000),
        blocks: [{ type: 'text', text: '<system-reminder>\nThe task list is empty.' }]
      },
      row('a2', 'assistant', 30_000),
      row('u2', 'user', 60_000)
    ])
    expect([...settled]).toEqual([['u1', { startedAt: 0, workedSeconds: 30 }]])
  })

  // A background-task notification lands after the turn settled and the agent answers it.
  it('times a task notification as a turn of its own', () => {
    const settled = nativeChatTranscriptSettledTurns([
      row('u1', 'user', 0),
      row('a1', 'assistant', 10_000),
      notification('n1', 200_000),
      row('a2', 'assistant', 208_000),
      row('u2', 'user', 300_000)
    ])
    expect([...settled]).toEqual([
      ['u1', { startedAt: 0, workedSeconds: 10 }],
      ['n1', { startedAt: 200_000, workedSeconds: 8 }]
    ])
  })
})

describe('nativeChatLatestTurnId', () => {
  it('names the last prompt, not a harness reminder after it', () => {
    expect(
      nativeChatLatestTurnId([
        row('u1', 'user', 0),
        row('a1', 'assistant', 5_000),
        {
          ...row('notice', 'user', 10_000),
          blocks: [{ type: 'text', text: '<system-reminder>\nThe task list is empty.' }]
        }
      ])
    ).toBe('u1')
    expect(
      nativeChatLatestTurnId([
        row('u1', 'user', 0),
        row('a1', 'assistant', 5_000),
        notification('n1', 10_000)
      ])
    ).toBe('n1')
    expect(nativeChatLatestTurnId([row('a1', 'assistant', 0)])).toBeNull()
  })
})
