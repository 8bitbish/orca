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
