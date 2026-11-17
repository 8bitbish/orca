import { describe, expect, it } from 'vitest'
import { deriveNativeChatStreamingText } from './native-chat-streaming'
import type { NativeChatMessage } from './native-chat-types'

const assistant = (text: string): NativeChatMessage => ({
  id: `a-${text.length}`,
  role: 'assistant',
  blocks: [{ type: 'text', text }],
  timestamp: null,
  source: 'transcript'
})
const user = (text: string): NativeChatMessage => ({
  id: `u-${text.length}`,
  role: 'user',
  blocks: [{ type: 'text', text }],
  timestamp: null,
  source: 'transcript'
})

describe('deriveNativeChatStreamingText', () => {
  // A short reply that repeats earlier wording ("Done.") would otherwise be read as
  // already-landed and suppressed, leaving the turn with no visible bubble at all.
  it('keeps an active-send preview that repeats text from the previous turn', () => {
    expect(
      deriveNativeChatStreamingText({
        messages: [
          user('first prompt'),
          assistant('Done.'),
          { ...user('next prompt'), id: 'pending:send-2', pendingSend: 'active' }
        ],
        previewText: 'Done',
        working: true
      })
    ).toBe('Done')
  })

  // A queued echo is not this turn's prompt, so the landed reply still suppresses a duplicate preview.
  it('drops a preview the transcript already contains when the echo is queued', () => {
    expect(
      deriveNativeChatStreamingText({
        messages: [
          user('do the thing'),
          assistant('Working on it, here is the full answer.'),
          { ...user('later'), id: 'pending:send-3', pendingSend: 'queued' }
        ],
        previewText: 'Working on it',
        working: true
      })
    ).toBeNull()
  })

  it('ignores a previous turn reply when this turn has not replied yet', () => {
    expect(
      deriveNativeChatStreamingText({
        messages: [assistant('A very long answer from the previous turn'), user('next prompt')],
        previewText: 'Short',
        working: true
      })
    ).toBe('Short')
  })
})
