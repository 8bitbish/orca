// Field readers shared by the closed-schema Slack and chat-draft cards. Each one
// throws InvalidCard on anything off the documented shape, and `parseCard` turns
// that into a null card so the fence shows as the raw block it is.

import {
  isNativeChatCardRecord,
  parseNativeChatCardActions,
  type NativeChatCardAction
} from './native-chat-card-actions'
import type {
  NativeChatSlackConversation,
  NativeChatSlackPerson
} from './native-chat-slack-card-payload'
import {
  isNativeChatSlackConversationId,
  isNativeChatSlackTs,
  isNativeChatSlackUserId,
  nativeChatSlackConversationKind
} from './native-chat-slack-ids'
import { normalizeNativeChatSlackImagePath } from './native-chat-slack-image-path'

export const MAX_CARD_NAME_LENGTH = 80

const PERSON_KEYS = ['name', 'userId', 'avatar']
const CONVERSATION_KEYS = ['id', 'name', 'kind']

class InvalidCard extends Error {}

export function reject(): never {
  throw new InvalidCard()
}

export function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!isNativeChatCardRecord(value) || Object.keys(value).some((key) => !keys.includes(key))) {
    reject()
  }
  return value
}

export function absent(value: unknown): value is null | undefined {
  return value === undefined || value === null
}

export function text(value: unknown, max: number): string {
  if (typeof value !== 'string' || value.length > max || value.trim() === '') {
    reject()
  }
  return value.trim()
}

export function optional<T>(value: unknown, read: (value: unknown) => T): T | undefined {
  return absent(value) ? undefined : read(value)
}

export function matching(value: unknown, test: (value: unknown) => value is string): string {
  return test(value) ? value : reject()
}

export function imagePath(value: unknown): string {
  return normalizeNativeChatSlackImagePath(value) ?? reject()
}

export function person(
  value: unknown,
  keys: readonly string[] = PERSON_KEYS
): NativeChatSlackPerson {
  const raw = record(value, keys)
  const userId = optional(raw.userId, (id) => matching(id, isNativeChatSlackUserId))
  const avatar = optional(raw.avatar, imagePath)
  return {
    name: text(raw.name, MAX_CARD_NAME_LENGTH),
    ...(userId ? { userId } : {}),
    ...(avatar ? { avatar } : {})
  }
}

export function conversation(value: unknown): NativeChatSlackConversation {
  const raw = record(value, CONVERSATION_KEYS)
  const id = matching(raw.id, isNativeChatSlackConversationId)
  const name = optional(raw.name, (name) => text(name, MAX_CARD_NAME_LENGTH).replace(/^#/, ''))
  const kind = optional(raw.kind, (kind) =>
    kind === 'channel' || kind === 'dm' || kind === 'group' ? kind : reject()
  )
  return { id, ...(name ? { name } : {}), kind: kind ?? nativeChatSlackConversationKind(id) }
}

export function actions(value: unknown): NativeChatCardAction[] {
  return parseNativeChatCardActions(absent(value) ? undefined : value, { closed: true }) ?? reject()
}

/** The thread parent, dropped when it is the message itself. */
export function threadTs(value: unknown, ts?: string): string | undefined {
  const parent = optional(value, (raw) => matching(raw, isNativeChatSlackTs))
  return parent === ts ? undefined : parent
}

export function parseCard<T>(source: string, read: (value: unknown) => T): T | null {
  let value: unknown
  try {
    value = JSON.parse(source)
  } catch {
    return null
  }
  try {
    return read(value)
  } catch (error) {
    if (error instanceof InvalidCard) {
      return null
    }
    throw error
  }
}
