import { describe, expect, it } from 'vitest'
import type { NativeChatMessage } from '../../../../src/shared/native-chat/native-chat-types'
import {
  buildMobileNativeChatTransientData,
  foldMobileNativeChatMessages
} from './mobile-native-chat-render-data'

function assistant(id: string, text: string): NativeChatMessage {
  return {
    id,
    role: 'assistant',
    blocks: [{ type: 'text', text }],
    timestamp: 0,
    source: 'transcript'
  }
}

const fold = (messages: NativeChatMessage[]) => foldMobileNativeChatMessages(messages, 'claude')

function build(
  messages: NativeChatMessage[],
  streaming: string | null,
  pending: Parameters<typeof buildMobileNativeChatTransientData>[0]['pending']
): NativeChatMessage[] {
  return buildMobileNativeChatTransientData({
    folded: fold(messages),
    streaming,
    pending
  }).data
}

describe('buildMobileNativeChatTransientData', () => {
  it('splits active and queued echoes around the streaming bubble', () => {
    const data = build([assistant('a1', 'hello')], 'Sure, working on it', [
      { id: 'p1', text: 'first', pendingSend: 'active' },
      { id: 'p2', text: 'second', pendingSend: 'queued' }
    ])
    expect(data.map((message) => message.id)).toEqual(['a1', 'p1', 'streaming', 'p2'])
  })
})
