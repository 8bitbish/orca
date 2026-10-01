import { describe, expect, it } from 'vitest'
import type { NativeChatMessage } from './native-chat-types'
import { compareNativeChatTranscriptMessages } from './native-chat-transcript-projection'
import {
  nativeChatHarnessTurns,
  nativeChatRowTurnKeys,
  nativeChatSelfAnchoredTurnRows
} from './native-chat-turn-grouping'

function message(id: string, role: NativeChatMessage['role'] = 'assistant'): NativeChatMessage {
  return { id, role, blocks: [{ type: 'text', text: id }], timestamp: null, source: 'transcript' }
}

describe('nativeChatRowTurnKeys', () => {
  it('keeps rows after a mid-turn send with the turn that produced them', () => {
    // The #23621 shape: B lands mid-turn, three tool rows follow, all one turn.
    const messages = [
      message('A', 'user'),
      message('t1'),
      message('B', 'user'),
      message('t2'),
      message('t3'),
      message('t4')
    ]
    const owned = new Map([
      ['A', 'A'],
      ['t1', 'A'],
      ['B', 'A'],
      ['t2', 'A'],
      ['t3', 'A'],
      ['t4', 'A']
    ])
    expect(nativeChatRowTurnKeys(messages, owned)).toEqual(['A', 'A', 'A', 'A', 'A', 'A'])
  })

  it('lets an unmapped user row key itself and unmapped rows inherit it', () => {
    // C is an optimistic echo the journal has not admitted yet: positional rules.
    const messages = [message('A', 'user'), message('t1'), message('C', 'user'), message('t2')]
    const owned = new Map([
      ['A', 'A'],
      ['t1', 'A']
    ])
    expect(nativeChatRowTurnKeys(messages, owned)).toEqual(['A', 'A', 'C', 'C'])
  })

  it('reproduces preceding-user grouping exactly when the host attributes nothing', () => {
    const messages = [
      message('lead'),
      message('A', 'user'),
      message('t1'),
      message('B', 'user'),
      message('t2')
    ]
    const positional = [undefined, 'A', 'A', 'B', 'B']
    expect(nativeChatRowTurnKeys(messages, null)).toEqual(positional)
    expect(nativeChatRowTurnKeys(messages, new Map())).toEqual(positional)
  })

  it('keys a provider-opened turn to a record no message carries', () => {
    const messages = [message('A', 'user'), message('t1'), message('t2')]
    const owned = new Map([
      ['A', 'A'],
      ['t1', 'wake-turn'],
      ['t2', 'wake-turn']
    ])
    expect(nativeChatRowTurnKeys(messages, owned)).toEqual(['A', 'wake-turn', 'wake-turn'])
  })
})

describe('nativeChatSelfAnchoredTurnRows', () => {
  it('anchors a turn with no user bubble at its first rendered row', () => {
    const messages = [message('A', 'user'), message('t1'), message('t2'), message('t3')]
    const turnKeys = ['A', 'A', 'wake-turn', 'wake-turn']
    expect(nativeChatSelfAnchoredTurnRows(messages, turnKeys)).toEqual(new Map([['wake-turn', 2]]))
  })

  it('never anchors a turn whose key is a rendered message', () => {
    const messages = [message('A', 'user'), message('t1')]
    expect(nativeChatSelfAnchoredTurnRows(messages, ['A', 'A']).size).toBe(0)
  })
})

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
    expect([
      ...nativeChatSelfAnchoredTurnRows(
        drawn,
        nativeChatRowTurnKeys(drawn, turns?.turnKeysByItemId)
      )
    ]).toEqual([['n1', 2]])
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
