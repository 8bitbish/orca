// Which of a card's actions was taken; project and Slack cards share it. Transcripts
// belong to the agent CLI and Orca only reads them, so the choice is not stored in
// the message: a later user message equal to an action's reply is that action,
// chosen. Free-text replies cannot be matched that way, so each platform keeps
// their text in a small local record.

import type { NativeChatMessage } from './native-chat-types'
import { deriveNativeChatRowContent } from './native-chat-row-content'
import type { NativeChatCardAction } from './native-chat-card-actions'

export type NativeChatProjectCardChoice = { actionIndex: number; text: string }

function fnv1a(text: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(36)
}

/** Stable per card: the message it sits in plus its source, so two cards in one reply differ. */
export function nativeChatProjectCardKey(messageId: string, source: string): string {
  return `${messageId}:${fnv1a(source.trim())}`
}

function normalizedReply(text: string): string {
  return text.replace(/\r\n?/g, '\n').trim()
}

export function deriveNativeChatProjectCardChoice(args: {
  actions: readonly NativeChatCardAction[]
  messages: readonly NativeChatMessage[]
  messageId: string | undefined
  recordedInput: string | null
}): NativeChatProjectCardChoice | null {
  const { actions, messages, messageId, recordedInput } = args
  if (recordedInput !== null) {
    const inputIndex = actions.findIndex((action) => action.kind === 'input')
    if (inputIndex !== -1) {
      return { actionIndex: inputIndex, text: recordedInput }
    }
  }
  const replies = actions.flatMap((action, actionIndex) =>
    action.kind === 'reply' ? [{ actionIndex, reply: normalizedReply(action.reply) }] : []
  )
  const cardIndex = messageId === undefined ? -1 : messages.findIndex((m) => m.id === messageId)
  if (replies.length === 0 || cardIndex === -1) {
    return null
  }
  for (const message of messages.slice(cardIndex + 1)) {
    if (message.role !== 'user') {
      continue
    }
    const sent = normalizedReply(deriveNativeChatRowContent(message.blocks).markdown)
    const match = replies.find((candidate) => candidate.reply === sent)
    if (match) {
      return { actionIndex: match.actionIndex, text: match.reply }
    }
  }
  return null
}
