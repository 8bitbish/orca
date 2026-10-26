// Use status previews until transcript replies catch up; share desktop/mobile visibility to avoid duplicate bubbles.

import type { NativeChatMessage } from '../native-chat-types'

/** Stable preview id across ticks lets the real turn replace it without key churn. */
export const NATIVE_CHAT_STREAMING_ID = 'streaming'

function assistantText(message: NativeChatMessage | undefined): string {
  if (!message || message.role !== 'assistant') {
    return ''
  }
  return message.blocks
    .filter((b) => b.type === 'text')
    .map((b) => (b.type === 'text' ? b.text : ''))
    .join('')
    .trim()
}

// Read past tool/thought rows for the latest assistant words, stopping at the next user-message boundary.
export function latestNativeChatReplyText(
  messages: readonly NativeChatMessage[],
  after = -1
): string {
  for (let index = messages.length - 1; index > after; index -= 1) {
    const message = messages[index]!
    if (message.role === 'user') {
      return ''
    }
    const text = assistantText(message)
    if (text) {
      return text
    }
  }
  return ''
}

// Show only working previews ahead of transcript text; always suppress tool stdout/errors because transcript catch-up cannot retire them.
// Pass only authoritative turns in `messages`; optimistic echoes are described by `hasOpenIdleSend`.
export function deriveNativeChatStreamingText(args: {
  messages: readonly NativeChatMessage[]
  previewText: string | null | undefined
  working: boolean
  previewIsToolOutput?: boolean
  /** True while an echo sent to an *idle* agent is still open: the reply now
   *  streaming answers that un-transcribed prompt, so the landed rows are an earlier turn.
   *  A queued echo does not count — there the streaming reply belongs to a prompt
   *  already in the transcript, so the landed rows can be that same turn. */
  hasOpenIdleSend?: boolean
}): string | null {
  const { messages, previewText, working, previewIsToolOutput, hasOpenIdleSend = false } = args
  if (!working || previewIsToolOutput) {
    return null
  }
  const text = previewText?.trim()
  if (!text) {
    return null
  }
  // The landed rows are an earlier turn, so no check below can speak for this one —
  // a short reply repeating earlier text would suppress a valid preview.
  if (hasOpenIdleSend) {
    return text
  }
  const lastText = assistantText(messages.at(-1))
  if (lastText.includes(text) || text.length <= lastText.length) {
    return null
  }
  // Tool/thought rows may follow a sentence; hide only a caught-up duplicate, never a new shorter reply.
  if (!lastText && latestNativeChatReplyText(messages).includes(text)) {
    return null
  }
  return text
}

export function nativeChatStreamingMessage(text: string): NativeChatMessage {
  return {
    id: NATIVE_CHAT_STREAMING_ID,
    role: 'assistant',
    blocks: [{ type: 'text', text }],
    timestamp: null,
    source: 'hook'
  }
}
