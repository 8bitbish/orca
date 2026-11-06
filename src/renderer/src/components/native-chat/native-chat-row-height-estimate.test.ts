import { describe, expect, it } from 'vitest'
import type { NativeChatMessage } from '../../../../shared/native-chat/native-chat-types'
import {
  estimateNativeChatRowHeight,
  nativeChatRowContentMetrics
} from './native-chat-row-height-estimate'

const NO_CHROME = { hasReceipt: false, hasStatus: false, hasTurnDiff: false }

function message(text: string, role: NativeChatMessage['role'] = 'assistant'): NativeChatMessage {
  return {
    id: `m-${text.length}`,
    role,
    blocks: [{ type: 'text', text }],
    timestamp: 1,
    source: 'transcript'
  }
}

describe('transcript row height estimate', () => {
  // A thought is one folded line until opened; its text must not reserve a screen.
  it('estimates a reasoning row as its folded line, whatever its length', () => {
    const long = Array.from({ length: 40 }, () => 'line').join('\n')
    const thought = estimateNativeChatRowHeight(
      nativeChatRowContentMetrics(message(long, 'reasoning')),
      NO_CHROME
    )
    const reply = estimateNativeChatRowHeight(nativeChatRowContentMetrics(message(long)), NO_CHROME)
    expect(thought).toBe(24)
    expect(reply).toBeGreaterThan(thought)
  })

  it('keeps role-specific chrome when two messages share their blocks', () => {
    const blocks: NativeChatMessage['blocks'] = [{ type: 'text', text: 'same content' }]
    const withRole = (role: NativeChatMessage['role']): NativeChatMessage => ({
      ...message('same content', role),
      blocks
    })

    expect(nativeChatRowContentMetrics(withRole('user')).role).toBe('user')
    expect(nativeChatRowContentMetrics(withRole('assistant')).role).toBe('assistant')
  })
})
