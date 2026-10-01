// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from 'vitest'
import type { NativeChatMessage } from '../../../../shared/native-chat-types'
import { parseNativeChatProjectCardPayload } from '../../../../shared/native-chat-project-card-payload'
import {
  deriveNativeChatProjectCardChoice,
  nativeChatProjectCardKey,
  readNativeChatProjectCardReply,
  recordNativeChatProjectCardReply
} from './native-chat-project-card-choice'

function message(id: string, role: NativeChatMessage['role'], text: string): NativeChatMessage {
  return { id, role, blocks: [{ type: 'text', text }], timestamp: null, source: 'transcript' }
}

const card = parseNativeChatProjectCardPayload(
  JSON.stringify({
    worktree: 'orca',
    actions: [
      { label: 'Approve', reply: 'Approve: fix pnpm' },
      { label: 'Hold', reply: 'Hold off for now' },
      { label: 'Reply…', input: true }
    ]
  })
)
const actions = card?.actions ?? []

afterEach(() => {
  localStorage.clear()
})

describe('deriveNativeChatProjectCardChoice', () => {
  it('marks the action whose reply a later user message repeats', () => {
    const messages = [
      message('u1', 'user', 'How is orca?'),
      message('a1', 'assistant', 'card here'),
      message('u2', 'user', '  Hold off for now\n')
    ]
    expect(
      deriveNativeChatProjectCardChoice({ actions, messages, messageId: 'a1', recordedInput: null })
    ).toEqual({ actionIndex: 1, text: 'Hold off for now' })
  })

  it('takes the first matching reply after the card', () => {
    const messages = [
      message('a1', 'assistant', 'card'),
      message('u2', 'user', 'something else'),
      message('u3', 'user', 'Approve: fix pnpm'),
      message('u4', 'user', 'Hold off for now')
    ]
    expect(
      deriveNativeChatProjectCardChoice({ actions, messages, messageId: 'a1', recordedInput: null })
        ?.actionIndex
    ).toBe(0)
  })

  it('ignores user messages before the card and assistant text that matches', () => {
    const messages = [
      message('u1', 'user', 'Approve: fix pnpm'),
      message('a1', 'assistant', 'card'),
      message('a2', 'assistant', 'Approve: fix pnpm')
    ]
    expect(
      deriveNativeChatProjectCardChoice({ actions, messages, messageId: 'a1', recordedInput: null })
    ).toBeNull()
  })

  it('needs the card to be in the transcript', () => {
    const messages = [message('u2', 'user', 'Approve: fix pnpm')]
    expect(
      deriveNativeChatProjectCardChoice({
        actions,
        messages,
        messageId: 'gone',
        recordedInput: null
      })
    ).toBeNull()
    expect(
      deriveNativeChatProjectCardChoice({
        actions,
        messages,
        messageId: undefined,
        recordedInput: null
      })
    ).toBeNull()
  })

  it('reads a free-text reply from the local record, since it cannot be matched', () => {
    expect(
      deriveNativeChatProjectCardChoice({
        actions,
        messages: [],
        messageId: 'a1',
        recordedInput: 'Try the other fix'
      })
    ).toEqual({ actionIndex: 2, text: 'Try the other fix' })
  })
})

describe('free-text reply record', () => {
  it('survives a reload, keyed per card', () => {
    const key = nativeChatProjectCardKey('a1', '{"worktree":"orca"}')
    expect(readNativeChatProjectCardReply(key)).toBeNull()
    recordNativeChatProjectCardReply(key, 'Try the other fix')
    expect(readNativeChatProjectCardReply(key)).toBe('Try the other fix')
    expect(
      readNativeChatProjectCardReply(nativeChatProjectCardKey('a1', '{"worktree":"x"}'))
    ).toBeNull()
  })

  it('reads nothing from corrupt storage', () => {
    localStorage.setItem('orca:nativeChatProjectCardReplies:v1', '{not json')
    expect(readNativeChatProjectCardReply('a1:abc')).toBeNull()
  })
})
