import { describe, it, expect } from 'vitest'
import type { NativeChatMessage } from '../../../../../../shared/native-chat/native-chat-types'

import { foldToolMessages } from '../../../../../../shared/native-chat/tools/native-chat-tool-fold'

function msg(
  overrides: Partial<NativeChatMessage> & Pick<NativeChatMessage, 'id'>
): NativeChatMessage {
  return {
    role: 'assistant',
    blocks: [],
    timestamp: 0,
    source: 'transcript',
    ...overrides
  }
}

describe('foldToolMessages', () => {
  it('drops a result after a user turn abandons the pending call', () => {
    const folded = foldToolMessages([
      msg({ id: 'c', role: 'assistant', blocks: [{ type: 'tool-call', name: 'Bash', input: {} }] }),
      msg({ id: 'u', role: 'user', blocks: [{ type: 'text', text: 'stop' }] }),
      msg({ id: 't', role: 'tool', blocks: [{ type: 'tool-result', output: 'x' }] })
    ])
    expect(folded.map((m) => m.id)).toEqual(['c', 'u'])
  })

  it('attributes a Claude tool result carried with a harness sidecar', () => {
    const folded = foldToolMessages([
      msg({
        id: 'a',
        role: 'assistant',
        blocks: [{ type: 'tool-call', name: 'Read', input: {} }]
      }),
      msg({
        id: 'u',
        role: 'user',
        blocks: [
          { type: 'tool-result', output: 'important output' },
          { type: 'text', text: '<system-reminder>continue</system-reminder>' }
        ]
      })
    ])

    expect(folded).toEqual([
      expect.objectContaining({
        id: 'a',
        blocks: [
          { type: 'tool-call', name: 'Read', input: {} },
          { type: 'tool-result', output: 'important output' }
        ]
      }),
      expect.objectContaining({
        id: 'u',
        blocks: [{ type: 'text', text: '<system-reminder>continue</system-reminder>' }]
      })
    ])
  })

  it('does not traverse an interruption sidecar carrying a stale result', () => {
    const folded = foldToolMessages([
      msg({
        id: 'a',
        role: 'assistant',
        blocks: [{ type: 'tool-call', name: 'Read', input: {} }]
      }),
      msg({
        id: 'i',
        role: 'user',
        blocks: [
          { type: 'tool-result', output: 'stale' },
          { type: 'text', text: '[Request interrupted by user]' }
        ]
      })
    ])

    expect(folded).toEqual([
      expect.objectContaining({
        id: 'a',
        blocks: [{ type: 'tool-call', name: 'Read', input: {} }]
      }),
      expect.objectContaining({
        id: 'i',
        blocks: [{ type: 'text', text: '[Request interrupted by user]' }]
      })
    ])
  })

  it('folds through a mid-turn harness reminder but not a real user turn', () => {
    const folded = foldToolMessages([
      msg({ id: 'a', role: 'assistant', blocks: [{ type: 'tool-call', name: 'Read', input: {} }] }),
      msg({ id: 'n', role: 'user', blocks: [{ type: 'text', text: '<system-reminder>note' }] }),
      msg({ id: 'r', role: 'tool', blocks: [{ type: 'tool-result', output: 'ok' }] })
    ])

    expect(folded.find((message) => message.id === 'a')?.blocks).toEqual([
      { type: 'tool-call', name: 'Read', input: {} },
      { type: 'tool-result', output: 'ok' }
    ])
  })

  // The notification's turn did this work; folded into the previous reply it would pass as that
  // turn's tool run, and fold with it.
  it('does not fold a task notification turn into the previous reply', () => {
    const folded = foldToolMessages([
      msg({ id: 'reply', role: 'assistant', blocks: [{ type: 'text', text: 'Done.' }] }),
      msg({ id: 'n', role: 'user', blocks: [{ type: 'text', text: '<task-notification>done' }] }),
      msg({ id: 'call', blocks: [{ type: 'tool-call', name: 'Bash', input: {} }] }),
      msg({ id: 'result', role: 'tool', blocks: [{ type: 'tool-result', output: 'ok' }] })
    ])

    expect(folded.map((message) => [message.id, message.blocks.length])).toEqual([
      ['reply', 1],
      ['n', 1],
      ['call', 2]
    ])
  })
})
