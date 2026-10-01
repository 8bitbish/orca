// The JSON bodies of the ```slack-message and ```slack-draft fences. The schema is
// closed: an unknown key, a malformed id or any field outside the documented shape
// rejects the whole card, and the fence then shows as the raw block it is. Optional
// fields may be absent or null.

import {
  isNativeChatCardRecord,
  parseNativeChatCardActions,
  type NativeChatCardAction
} from './native-chat-card-actions'
import {
  isNativeChatSlackConversationId,
  isNativeChatSlackDomain,
  isNativeChatSlackTeamId,
  isNativeChatSlackTs,
  isNativeChatSlackUserId,
  nativeChatSlackConversationKind,
  type NativeChatSlackConversationKind
} from './native-chat-slack-ids'
import type { NativeChatSlackTarget } from './native-chat-slack-href'
import { normalizeNativeChatSlackImagePath } from './native-chat-slack-image-path'
import { parseNativeChatSlackPermalink } from './native-chat-slack-links'

export const NATIVE_CHAT_SLACK_MESSAGE_FENCE = 'slack-message'
export const NATIVE_CHAT_SLACK_DRAFT_FENCE = 'slack-draft'

export type NativeChatSlackPerson = {
  name: string
  userId?: string
  /** Cache-relative path of a downloaded avatar image. */
  avatar?: string
}

export type NativeChatSlackConversation = {
  id: string
  name?: string
  kind: NativeChatSlackConversationKind
}

export type NativeChatSlackImage = {
  /** Relative to the slack-mcp image cache on the chat's host. */
  path: string
  name?: string
  width?: number
  height?: number
}

export type NativeChatSlackMessageStatus = 'needs-you' | 'fyi'

export type NativeChatSlackMessageCard = {
  status: NativeChatSlackMessageStatus
  teamId: string
  domain?: string
  from: NativeChatSlackPerson
  channel: NativeChatSlackConversation
  ts: string
  /** The thread's parent ts when the message is a reply; never equal to `ts`. */
  threadTs?: string
  sentAt?: string
  permalink?: string
  summary: string
  /** The message as Slack wrote it, in mrkdwn. */
  text?: string
  images: NativeChatSlackImage[]
  thread?: { replies: number; youReplied: boolean }
  actions: NativeChatCardAction[]
}

export type NativeChatSlackDraftCard = {
  teamId: string
  domain?: string
  to?: NativeChatSlackPerson
  channel?: NativeChatSlackConversation
  threadTs?: string
  text: string
  actions: NativeChatCardAction[]
}

const MAX_NAME_LENGTH = 80
const MAX_SUMMARY_LENGTH = 600
const MAX_MESSAGE_TEXT_LENGTH = 8000
const MAX_DRAFT_TEXT_LENGTH = 4000
const MAX_IMAGES = 6
const MAX_IMAGE_DIMENSION = 50_000
const MAX_THREAD_REPLIES = 100_000
const ISO_DATE_TIME =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/

const MESSAGE_KEYS = [
  'status',
  'teamId',
  'domain',
  'from',
  'channel',
  'ts',
  'threadTs',
  'sentAt',
  'permalink',
  'summary',
  'text',
  'images',
  'thread',
  'actions'
]
const DRAFT_KEYS = ['teamId', 'domain', 'to', 'channel', 'threadTs', 'text', 'actions']
const PERSON_KEYS = ['name', 'userId', 'avatar']
const CONVERSATION_KEYS = ['id', 'name', 'kind']
const IMAGE_KEYS = ['path', 'name', 'width', 'height']
const THREAD_KEYS = ['replies', 'youReplied']

/** Thrown inside a parse and caught at its top: any bad field rejects the card. */
class InvalidCard extends Error {}

function reject(): never {
  throw new InvalidCard()
}

function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!isNativeChatCardRecord(value) || Object.keys(value).some((key) => !keys.includes(key))) {
    reject()
  }
  return value
}

function absent(value: unknown): value is null | undefined {
  return value === undefined || value === null
}

function text(value: unknown, max: number): string {
  if (typeof value !== 'string' || value.length > max || value.trim() === '') {
    reject()
  }
  return value.trim()
}

function optional<T>(value: unknown, read: (value: unknown) => T): T | undefined {
  return absent(value) ? undefined : read(value)
}

function matching(value: unknown, test: (value: unknown) => value is string): string {
  return test(value) ? value : reject()
}

function dimension(value: unknown): number {
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value > 0 &&
    value <= MAX_IMAGE_DIMENSION
    ? value
    : reject()
}

function imagePath(value: unknown): string {
  return normalizeNativeChatSlackImagePath(value) ?? reject()
}

function person(value: unknown): NativeChatSlackPerson {
  const raw = record(value, PERSON_KEYS)
  const userId = optional(raw.userId, (id) => matching(id, isNativeChatSlackUserId))
  const avatar = optional(raw.avatar, imagePath)
  return {
    name: text(raw.name, MAX_NAME_LENGTH),
    ...(userId ? { userId } : {}),
    ...(avatar ? { avatar } : {})
  }
}

function conversation(value: unknown): NativeChatSlackConversation {
  const raw = record(value, CONVERSATION_KEYS)
  const id = matching(raw.id, isNativeChatSlackConversationId)
  const name = optional(raw.name, (name) => text(name, MAX_NAME_LENGTH).replace(/^#/, ''))
  const kind = optional(raw.kind, (kind) =>
    kind === 'channel' || kind === 'dm' || kind === 'group' ? kind : reject()
  )
  return { id, ...(name ? { name } : {}), kind: kind ?? nativeChatSlackConversationKind(id) }
}

function image(value: unknown): NativeChatSlackImage {
  const raw = record(value, IMAGE_KEYS)
  const name = optional(raw.name, (name) => text(name, 200))
  const width = optional(raw.width, dimension)
  const height = optional(raw.height, dimension)
  return {
    path: imagePath(raw.path),
    ...(name ? { name } : {}),
    ...(width ? { width } : {}),
    ...(height ? { height } : {})
  }
}

function images(value: unknown): NativeChatSlackImage[] {
  if (absent(value)) {
    return []
  }
  return Array.isArray(value) && value.length <= MAX_IMAGES ? value.map(image) : reject()
}

function thread(value: unknown): { replies: number; youReplied: boolean } {
  const raw = record(value, THREAD_KEYS)
  const { replies, youReplied } = raw
  if (
    typeof replies !== 'number' ||
    !Number.isInteger(replies) ||
    replies < 0 ||
    replies > MAX_THREAD_REPLIES ||
    typeof youReplied !== 'boolean'
  ) {
    reject()
  }
  return { replies, youReplied }
}

function sentAt(value: unknown): string {
  return typeof value === 'string' && ISO_DATE_TIME.test(value) && !Number.isNaN(Date.parse(value))
    ? value
    : reject()
}

function actions(value: unknown): NativeChatCardAction[] {
  return parseNativeChatCardActions(absent(value) ? undefined : value, { closed: true }) ?? reject()
}

/** The thread parent, dropped when it is the message itself. */
function threadTs(value: unknown, ts?: string): string | undefined {
  const parent = optional(value, (raw) => matching(raw, isNativeChatSlackTs))
  return parent === ts ? undefined : parent
}

function parse<T>(source: string, read: (value: unknown) => T): T | null {
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

function readMessageCard(value: unknown): NativeChatSlackMessageCard {
  const raw = record(value, MESSAGE_KEYS)
  const status = optional(raw.status, (status) =>
    status === 'needs-you' || status === 'fyi' ? status : reject()
  )
  const teamId = matching(raw.teamId, isNativeChatSlackTeamId)
  const domain = optional(raw.domain, (domain) => matching(domain, isNativeChatSlackDomain))
  const channel = conversation(raw.channel)
  const ts = matching(raw.ts, isNativeChatSlackTs)
  const parent = threadTs(raw.threadTs, ts)
  const permalink = optional(raw.permalink, (link) =>
    typeof link === 'string'
      ? (parseNativeChatSlackPermalink(link, { channelId: channel.id, ts, domain }) ?? reject())
      : reject()
  )
  const body = optional(raw.text, (body) => text(body, MAX_MESSAGE_TEXT_LENGTH))
  const replies = optional(raw.thread, thread)
  const when = optional(raw.sentAt, sentAt)
  return {
    status: status ?? 'needs-you',
    teamId,
    ...(domain ? { domain } : {}),
    from: person(raw.from),
    channel,
    ts,
    ...(parent ? { threadTs: parent } : {}),
    ...(when ? { sentAt: when } : {}),
    ...(permalink ? { permalink } : {}),
    summary: text(raw.summary, MAX_SUMMARY_LENGTH),
    ...(body ? { text: body } : {}),
    images: images(raw.images),
    ...(replies ? { thread: replies } : {}),
    actions: actions(raw.actions)
  }
}

function readDraftCard(value: unknown): NativeChatSlackDraftCard {
  const raw = record(value, DRAFT_KEYS)
  const teamId = matching(raw.teamId, isNativeChatSlackTeamId)
  const domain = optional(raw.domain, (domain) => matching(domain, isNativeChatSlackDomain))
  const to = optional(raw.to, person)
  const channel = optional(raw.channel, conversation)
  if (!to && !channel) {
    reject()
  }
  const parent = threadTs(raw.threadTs)
  return {
    teamId,
    ...(domain ? { domain } : {}),
    ...(to ? { to } : {}),
    ...(channel ? { channel } : {}),
    ...(parent ? { threadTs: parent } : {}),
    text: text(raw.text, MAX_DRAFT_TEXT_LENGTH),
    actions: actions(raw.actions)
  }
}

/** Null for bad JSON or anything outside the documented shape. */
export function parseNativeChatSlackMessageCard(source: string): NativeChatSlackMessageCard | null {
  return parse(source, readMessageCard)
}

/** Null for bad JSON or anything outside the documented shape. */
export function parseNativeChatSlackDraftCard(source: string): NativeChatSlackDraftCard | null {
  return parse(source, readDraftCard)
}

function domainOf(card: { domain?: string; permalink?: string }): { domain?: string } {
  if (card.domain !== undefined) {
    return { domain: card.domain }
  }
  // A validated permalink is always https://<domain>.slack.com/…
  const host = card.permalink === undefined ? undefined : new URL(card.permalink).hostname
  return host === undefined ? {} : { domain: host.slice(0, -'.slack.com'.length) }
}

/** What the card's "Open in Slack" opens: the message, or its thread reply. */
export function nativeChatSlackMessageCardTarget(
  card: NativeChatSlackMessageCard
): NativeChatSlackTarget {
  return {
    kind: 'message',
    teamId: card.teamId,
    channelId: card.channel.id,
    ts: card.ts,
    ...(card.threadTs ? { threadTs: card.threadTs } : {}),
    ...domainOf(card)
  }
}

/** A person chip's target, or null when the card did not give their user id. */
export function nativeChatSlackPersonTarget(
  card: { teamId: string; domain?: string; permalink?: string },
  person: NativeChatSlackPerson
): NativeChatSlackTarget | null {
  return person.userId === undefined
    ? null
    : { kind: 'user', teamId: card.teamId, userId: person.userId, ...domainOf(card) }
}

/** A conversation chip's target. */
export function nativeChatSlackConversationTarget(
  card: { teamId: string; domain?: string; permalink?: string },
  conversation: NativeChatSlackConversation
): NativeChatSlackTarget {
  return { kind: 'channel', teamId: card.teamId, channelId: conversation.id, ...domainOf(card) }
}
