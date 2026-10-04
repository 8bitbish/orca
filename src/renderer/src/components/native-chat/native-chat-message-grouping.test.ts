import { describe, it, expect } from 'vitest'
import type { NativeChatMessage } from '../../../../shared/native-chat-types'
import { orderNativeChatMessages } from './native-chat-message-grouping'
import { NATIVE_CHAT_STREAMING_ID } from '../../../../shared/native-chat-streaming'

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

describe('orderNativeChatMessages', () => {
  it('orders by ascending timestamp, null first', () => {
    const ordered = orderNativeChatMessages([
      msg({ id: 'b', timestamp: 20 }),
      msg({ id: 'a', timestamp: 10 }),
      msg({ id: 'n', timestamp: null })
    ])
    expect(ordered.map((m) => m.id)).toEqual(['n', 'a', 'b'])
  })

  it('breaks timestamp ties by id deterministically', () => {
    const ordered = orderNativeChatMessages([
      msg({ id: 'z', timestamp: 5 }),
      msg({ id: 'a', timestamp: 5 })
    ])
    expect(ordered.map((m) => m.id)).toEqual(['a', 'z'])
  })

  // The reply currently streaming is the answer to the prompt the user just sent,
  // so it has to render BELOW that prompt's echo. Ranking the echo last put the
  // reply above it: the sent message looked stuck at the bottom of the transcript
  // and the user had to scroll up to read the response.
  it('sorts the streaming preview after real content and after an idle send echo', () => {
    const ordered = orderNativeChatMessages([
      msg({ id: NATIVE_CHAT_STREAMING_ID, timestamp: null }),
      msg({ id: 'pending:abc', role: 'user', timestamp: 20, source: 'scrape' }),
      msg({ id: 'real-user', role: 'user', timestamp: 10 })
    ])
    expect(ordered.map((m) => m.id)).toEqual(['real-user', 'pending:abc', 'streaming'])
  })

  it('keeps an echo queued mid-reply below the streaming preview', () => {
    const ordered = orderNativeChatMessages([
      msg({ id: 'pending-queued:abc', role: 'user', timestamp: 20, source: 'scrape' }),
      msg({ id: NATIVE_CHAT_STREAMING_ID, timestamp: null }),
      msg({ id: 'real-user', role: 'user', timestamp: 10 })
    ])
    expect(ordered.map((m) => m.id)).toEqual(['real-user', 'streaming', 'pending-queued:abc'])
  })

  it('orders an idle echo, the reply to it, then a prompt queued during that reply', () => {
    const ordered = orderNativeChatMessages([
      msg({ id: 'pending-queued:second', role: 'user', timestamp: 30, source: 'scrape' }),
      msg({ id: NATIVE_CHAT_STREAMING_ID, timestamp: null }),
      msg({ id: 'pending:first', role: 'user', timestamp: 20, source: 'scrape' })
    ])
    expect(ordered.map((m) => m.id)).toEqual([
      'pending:first',
      'streaming',
      'pending-queued:second'
    ])
  })
})
