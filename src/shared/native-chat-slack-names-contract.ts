// Names for Slack mentions that carry only an id (`<@U…>`, `<#C…>`), looked up in
// slack-mcp's user and channel caches on the chat's host. Shared by desktop IPC
// (`nativeChat:slackNames`) and runtime RPC (`nativeChat.slackNames`) alike.

import { isNativeChatSlackConversationId, isNativeChatSlackUserId } from './native-chat-slack-ids'
import { parseSlackMrkdwn, type SlackMrkdwnNode } from './native-chat-slack-mrkdwn'

/** Ids per kind in one request; a draft or message rarely mentions more than a few. */
export const NATIVE_CHAT_SLACK_NAMES_MAX_IDS = 50
export const NATIVE_CHAT_SLACK_NAME_MAX_LENGTH = 80

export type NativeChatSlackNamesRequest = { userIds: string[]; channelIds: string[] }

export type NativeChatSlackNamesResult = {
  users: Record<string, string>
  channels: Record<string, string>
}

export const EMPTY_NATIVE_CHAT_SLACK_NAMES: NativeChatSlackNamesResult = {
  users: {},
  channels: {}
}

/** A display name fit for a chip: trimmed, one line, bounded; null when unusable. */
export function cleanNativeChatSlackName(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const name = value.replace(/\s+/g, ' ').trim()
  return name.length > 0 && name.length <= NATIVE_CHAT_SLACK_NAME_MAX_LENGTH ? name : null
}

function collect(nodes: readonly SlackMrkdwnNode[], into: NativeChatSlackNamesRequest): void {
  for (const node of nodes) {
    if (node.type === 'user' && node.label === undefined && !into.userIds.includes(node.userId)) {
      into.userIds.push(node.userId)
    } else if (
      node.type === 'channel' &&
      node.label === undefined &&
      !into.channelIds.includes(node.channelId)
    ) {
      into.channelIds.push(node.channelId)
    } else if (node.type === 'bold' || node.type === 'italic' || node.type === 'strike') {
      collect(node.children, into)
    }
  }
}

/** The mention ids in `text` that carry no name of their own, bounded per kind. */
export function collectNativeChatSlackUnnamedMentions(text: string): NativeChatSlackNamesRequest {
  const into: NativeChatSlackNamesRequest = { userIds: [], channelIds: [] }
  collect(parseSlackMrkdwn(text), into)
  return {
    userIds: into.userIds.slice(0, NATIVE_CHAT_SLACK_NAMES_MAX_IDS),
    channelIds: into.channelIds.slice(0, NATIVE_CHAT_SLACK_NAMES_MAX_IDS)
  }
}

function parseNameMap(
  value: unknown,
  isId: (id: string) => boolean
): Record<string, string> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null
  }
  const out: Record<string, string> = {}
  for (const [id, raw] of Object.entries(value)) {
    const name = cleanNativeChatSlackName(raw)
    if (isId(id) && name !== null) {
      out[id] = name
    }
  }
  return out
}

/** A host reply, keeping only well-formed id → name pairs; null when not a reply at all. */
export function parseNativeChatSlackNamesResult(value: unknown): NativeChatSlackNamesResult | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }
  const users = parseNameMap('users' in value ? value.users : undefined, isNativeChatSlackUserId)
  const channels = parseNameMap(
    'channels' in value ? value.channels : undefined,
    isNativeChatSlackConversationId
  )
  return users && channels ? { users, channels } : null
}

/** The names a card already carries for its own sender, recipient and channel. */
export function nativeChatSlackCardKnownNames(card: {
  people: readonly ({ name: string; userId?: string } | undefined)[]
  conversations: readonly ({ id: string; name?: string } | undefined)[]
}): NativeChatSlackNamesResult {
  const users: Record<string, string> = {}
  const channels: Record<string, string> = {}
  for (const person of card.people) {
    if (person?.userId) {
      users[person.userId] = person.name
    }
  }
  for (const conversation of card.conversations) {
    if (conversation?.name) {
      channels[conversation.id] = conversation.name
    }
  }
  return { users, channels }
}

/** What still needs a lookup: the text's unnamed mentions minus names already known. */
export function missingNativeChatSlackNames(
  text: string,
  known: NativeChatSlackNamesResult
): NativeChatSlackNamesRequest {
  const wanted = collectNativeChatSlackUnnamedMentions(text)
  return {
    userIds: wanted.userIds.filter((id) => known.users[id] === undefined),
    channelIds: wanted.channelIds.filter((id) => known.channels[id] === undefined)
  }
}

/** Looked-up names under the card's own, which win where both exist. */
export function mergeNativeChatSlackNames(
  known: NativeChatSlackNamesResult,
  looked: NativeChatSlackNamesResult
): NativeChatSlackNamesResult {
  return {
    users: { ...looked.users, ...known.users },
    channels: { ...looked.channels, ...known.channels }
  }
}
