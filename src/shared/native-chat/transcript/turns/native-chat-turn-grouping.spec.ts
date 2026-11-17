import { describe, expect, it } from 'vitest'
import type { NativeChatMessage } from '../../native-chat-types'
import { compareNativeChatTranscriptMessages } from '../native-chat-transcript-projection'
import {
  nativeChatHarnessTurns,
  nativeChatRowTurnKeys,
  nativeChatTurnBarRows
} from './native-chat-turn-grouping'

function message(id: string, role: NativeChatMessage['role'] = 'assistant'): NativeChatMessage {
  return { id, role, blocks: [{ type: 'text', text: id }], timestamp: null, source: 'transcript' }
}

function harness(id: string, text: string): NativeChatMessage {
  return { ...message(id, 'user'), blocks: [{ type: 'text', text }] }
}

function timed(messages: NativeChatMessage[]): NativeChatMessage[] {
  return messages.map((row, index) => ({ ...row, timestamp: index * 1000 }))
}

describe('nativeChatHarnessTurns', () => {
  it('keys a task notification reply by the notification, not the previous prompt', () => {
    const messages = timed([
      message('u1', 'user'),
      message('reply-1'),
      harness('n1', '<task-notification>\n<task-id>b1</task-id>'),
      message('think-2', 'reasoning'),
      message('reply-2'),
      message('u2', 'user'),
      message('reply-3')
    ])
    const turns = nativeChatHarnessTurns(messages, compareNativeChatTranscriptMessages)
    expect(turns?.latestTurnOpenedBy).toBeNull()
    expect([...(turns?.turnKeysByItemId ?? [])]).toEqual([
      ['think-2', 'n1'],
      ['reply-2', 'n1']
    ])
    const drawn = messages.filter((row) => row.id !== 'n1')
    expect(nativeChatRowTurnKeys(drawn, turns?.turnKeysByItemId)).toEqual([
      'u1',
      'u1',
      'n1',
      'n1',
      'u2',
      'u2'
    ])
    expect(
      nativeChatTurnBarRows(drawn, nativeChatRowTurnKeys(drawn, turns?.turnKeysByItemId)).get('n1')
    ).toEqual({ index: 2, above: true })
  })

  it('names a notification that opened the newest turn as the running turn', () => {
    const turns = nativeChatHarnessTurns(
      timed([message('u1', 'user'), message('reply-1'), harness('n1', '<task-notification>')]),
      compareNativeChatTranscriptMessages
    )
    expect(turns?.latestTurnOpenedBy).toBe('n1')
  })

  it('never splits a turn at a mid-turn system reminder', () => {
    const messages = timed([
      message('u1', 'user'),
      message('call'),
      harness('r1', '<system-reminder>\nThe task list is empty.'),
      message('reply-1')
    ])
    expect(nativeChatHarnessTurns(messages, compareNativeChatTranscriptMessages)).toBeNull()
    expect(nativeChatRowTurnKeys(messages.filter((row) => row.id !== 'r1'))).toEqual([
      'u1',
      'u1',
      'u1'
    ])
  })

  it('keeps a reminder inside a notification turn with that turn', () => {
    const turns = nativeChatHarnessTurns(
      timed([
        message('u1', 'user'),
        harness('n1', '<task-notification>'),
        harness('r1', '<system-reminder>note'),
        message('reply-2')
      ]),
      compareNativeChatTranscriptMessages
    )
    expect(turns?.turnKeysByItemId.get('reply-2')).toBe('n1')
  })

  it.each([
    ['a prompt slash command', '<command-message>review</command-message>\n<command-name>/review'],
    ['a shell command', '<bash-input>ls</bash-input>'],
    ['a peer hand-back', 'Another Claude session sent a message:\n<agent-message from="a1">done']
  ])('opens a turn for %s', (_label, text) => {
    const turns = nativeChatHarnessTurns(
      timed([message('u1', 'user'), message('reply-1'), harness('h1', text), message('reply-2')]),
      compareNativeChatTranscriptMessages
    )
    expect(turns?.turnKeysByItemId.get('reply-2')).toBe('h1')
  })

  it('does not open a turn for a local slash command', () => {
    expect(
      nativeChatHarnessTurns(
        timed([
          message('u1', 'user'),
          harness('c1', '<command-name>/model</command-name>\n<command-message>model'),
          message('reply-1')
        ]),
        compareNativeChatTranscriptMessages
      )
    ).toBeNull()
  })

  it('reads the deliveries in transcript order, whatever order they arrive in', () => {
    const [u1, reply1, n1, reply2] = timed([
      message('u1', 'user'),
      message('reply-1'),
      harness('n1', '<task-notification>'),
      message('reply-2')
    ])
    const turns = nativeChatHarnessTurns(
      [reply2, n1, u1, reply1],
      compareNativeChatTranscriptMessages
    )
    expect([...(turns?.turnKeysByItemId ?? [])]).toEqual([['reply-2', 'n1']])
  })
})
