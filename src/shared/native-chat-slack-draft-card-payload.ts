// The JSON body of the ```slack-draft fence: a reply drafted for Jake, on Slack
// (the default), WhatsApp or Messenger, optionally quoting the message it answers.
// Same closed schema as the message card: anything off it shows the raw block.

import type { NativeChatCardAction } from './native-chat-card-actions'
import {
  nativeChatSlackCardDomain,
  type NativeChatSlackConversation,
  type NativeChatSlackPerson
} from './native-chat-slack-card-payload'
import {
  actions,
  conversation,
  MAX_CARD_NAME_LENGTH,
  matching,
  optional,
  parseCard,
  person,
  record,
  reject,
  text,
  threadTs
} from './native-chat-slack-card-fields'
import type { NativeChatSlackTarget } from './native-chat-slack-href'
import {
  isNativeChatSlackDomain,
  isNativeChatSlackTeamId,
  isNativeChatSlackTs
} from './native-chat-slack-ids'
import {
  nativeChatSlackPermalinkChannelId,
  parseNativeChatSlackPermalink
} from './native-chat-slack-links'

export const NATIVE_CHAT_SLACK_DRAFT_FENCE = 'slack-draft'

export type NativeChatDraftChatPlatform = 'whatsapp' | 'messenger'

export type NativeChatDraftReplyTo = {
  from: NativeChatSlackPerson
  /** The quoted message, in mrkdwn. */
  text: string
  ts?: string
  permalink?: string
  /** Where the quoted Slack message lives: the card's channel, else the permalink's. */
  channelId?: string
}

export type NativeChatSlackDraftCard = {
  platform: 'slack'
  teamId: string
  domain?: string
  to?: NativeChatSlackPerson
  channel?: NativeChatSlackConversation
  threadTs?: string
  replyTo?: NativeChatDraftReplyTo
  text: string
  actions: NativeChatCardAction[]
}

/** A WhatsApp or Messenger draft: a named chat, no Slack ids or chips. */
export type NativeChatChatAppDraftCard = {
  platform: NativeChatDraftChatPlatform
  chat: { name: string; id?: string }
  replyTo?: NativeChatDraftReplyTo
  text: string
  actions: NativeChatCardAction[]
}

export type NativeChatDraftCard = NativeChatSlackDraftCard | NativeChatChatAppDraftCard

const MAX_DRAFT_TEXT_LENGTH = 4000
const MAX_REPLY_TO_TEXT_LENGTH = 600
const MAX_CHAT_ID_LENGTH = 200

const SLACK_KEYS = [
  'platform',
  'teamId',
  'domain',
  'to',
  'channel',
  'threadTs',
  'replyTo',
  'text',
  'actions'
]
const CHAT_APP_KEYS = ['platform', 'chat', 'replyTo', 'text', 'actions']
const CHAT_KEYS = ['name', 'id']
const SLACK_REPLY_TO_KEYS = ['from', 'text', 'ts', 'permalink']
const CHAT_APP_REPLY_TO_KEYS = ['from', 'text']

function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index)
    if (code < 0x20 || code === 0x7f) {
      return true
    }
  }
  return false
}

function chatId(value: unknown): string {
  return typeof value === 'string' && !hasControlCharacter(value)
    ? text(value, MAX_CHAT_ID_LENGTH)
    : reject()
}

function slackReplyTo(
  value: unknown,
  scope: { channelId?: string; domain?: string }
): NativeChatDraftReplyTo {
  const raw = record(value, SLACK_REPLY_TO_KEYS)
  const ts = optional(raw.ts, (ts) => matching(ts, isNativeChatSlackTs))
  const link = optional(raw.permalink, (link) => (typeof link === 'string' ? link : reject()))
  // The card's channel, else the one the permalink names (a DM drafted by `to` alone).
  const channelId =
    scope.channelId ?? (link && nativeChatSlackPermalinkChannelId(link)) ?? undefined
  const permalink =
    link === undefined
      ? undefined
      : (ts &&
          channelId &&
          parseNativeChatSlackPermalink(link, { channelId, ts, domain: scope.domain })) ||
        reject()
  return {
    from: person(raw.from, ['name', 'userId']),
    text: text(raw.text, MAX_REPLY_TO_TEXT_LENGTH),
    ...(ts ? { ts } : {}),
    ...(permalink ? { permalink } : {}),
    ...(channelId && ts ? { channelId } : {})
  }
}

function readSlackDraft(raw: Record<string, unknown>): NativeChatSlackDraftCard {
  record(raw, SLACK_KEYS)
  const teamId = matching(raw.teamId, isNativeChatSlackTeamId)
  const domain = optional(raw.domain, (domain) => matching(domain, isNativeChatSlackDomain))
  const to = optional(raw.to, person)
  const channel = optional(raw.channel, conversation)
  if (!to && !channel) {
    reject()
  }
  const parent = threadTs(raw.threadTs)
  const replyTo = optional(raw.replyTo, (value) =>
    slackReplyTo(value, { channelId: channel?.id, domain })
  )
  return {
    platform: 'slack',
    teamId,
    ...(domain ? { domain } : {}),
    ...(to ? { to } : {}),
    ...(channel ? { channel } : {}),
    ...(parent ? { threadTs: parent } : {}),
    ...(replyTo ? { replyTo } : {}),
    text: text(raw.text, MAX_DRAFT_TEXT_LENGTH),
    actions: actions(raw.actions)
  }
}

function readChatAppDraft(
  raw: Record<string, unknown>,
  platform: NativeChatDraftChatPlatform
): NativeChatChatAppDraftCard {
  record(raw, CHAT_APP_KEYS)
  const chat = record(raw.chat, CHAT_KEYS)
  const id = optional(chat.id, chatId)
  const replyTo = optional(raw.replyTo, (value) => {
    const quoted = record(value, CHAT_APP_REPLY_TO_KEYS)
    return {
      from: person(quoted.from, ['name']),
      text: text(quoted.text, MAX_REPLY_TO_TEXT_LENGTH)
    }
  })
  return {
    platform,
    chat: { name: text(chat.name, MAX_CARD_NAME_LENGTH), ...(id ? { id } : {}) },
    ...(replyTo ? { replyTo } : {}),
    text: text(raw.text, MAX_DRAFT_TEXT_LENGTH),
    actions: actions(raw.actions)
  }
}

function readDraftCard(value: unknown): NativeChatDraftCard {
  const raw = record(value, [...new Set([...SLACK_KEYS, ...CHAT_APP_KEYS])])
  const platform = optional(raw.platform, (platform) =>
    platform === 'slack' || platform === 'whatsapp' || platform === 'messenger'
      ? platform
      : reject()
  )
  return platform === undefined || platform === 'slack'
    ? readSlackDraft(raw)
    : readChatAppDraft(raw, platform)
}

/** Null for bad JSON or anything outside the documented shape. */
export function parseNativeChatSlackDraftCard(source: string): NativeChatDraftCard | null {
  return parseCard(source, readDraftCard)
}

/** The quoted Slack message as a link target, when the card says where it lives. */
export function nativeChatSlackReplyToTarget(
  card: NativeChatSlackDraftCard
): NativeChatSlackTarget | null {
  const quoted = card.replyTo
  if (!quoted?.ts || !quoted.channelId) {
    return null
  }
  return {
    kind: 'message',
    teamId: card.teamId,
    channelId: quoted.channelId,
    ts: quoted.ts,
    ...(card.threadTs && card.threadTs !== quoted.ts ? { threadTs: card.threadTs } : {}),
    ...nativeChatSlackCardDomain({ domain: card.domain, permalink: quoted.permalink })
  }
}
