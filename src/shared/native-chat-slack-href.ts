// Slack chip links in chat replies:
//   slack-user:T…/U…            a person; opens your DM with them
//   slack-channel:T…/C…         a channel, DM (D…) or group (G…)
//   slack-message:T…/C…/<ts>[/<threadTs>]
// each with an optional `?d=<workspace subdomain>`, which only a message link needs
// to address the message itself. Anything off this grammar is not a chip.

import {
  isNativeChatSlackConversationId,
  isNativeChatSlackDomain,
  isNativeChatSlackTeamId,
  isNativeChatSlackTs,
  isNativeChatSlackUserId
} from './native-chat-slack-ids'

export const NATIVE_CHAT_SLACK_USER_SCHEME = 'slack-user:'
export const NATIVE_CHAT_SLACK_CHANNEL_SCHEME = 'slack-channel:'
export const NATIVE_CHAT_SLACK_MESSAGE_SCHEME = 'slack-message:'

/** Scheme names as rehype-sanitize's protocol list spells them. */
export const NATIVE_CHAT_SLACK_LINK_PROTOCOLS = ['slack-user', 'slack-channel', 'slack-message']

export type NativeChatSlackTarget =
  | { kind: 'user'; teamId: string; userId: string; domain?: string }
  | { kind: 'channel'; teamId: string; channelId: string; domain?: string }
  | {
      kind: 'message'
      teamId: string
      channelId: string
      ts: string
      /** The thread's parent ts when the message is a reply; never equal to `ts`. */
      threadTs?: string
      domain?: string
    }

const MAX_HREF_LENGTH = 256
const SLACK_HREF = /^\s*slack-(?:user|channel|message):/i

/** Whether an href uses a Slack chip scheme, valid or not; the chat keeps these links. */
export function isNativeChatSlackHref(href: string | undefined): href is string {
  return href !== undefined && SLACK_HREF.test(href)
}

function parseDomainQuery(query: string | undefined): string | undefined | null {
  if (query === undefined) {
    return undefined
  }
  const match = /^d=([^&=]*)$/.exec(query)
  return match && isNativeChatSlackDomain(match[1]) ? match[1] : null
}

/** The chip a Slack href names, or null for any other or malformed link. */
export function parseNativeChatSlackHref(href: string | undefined): NativeChatSlackTarget | null {
  const trimmed = href?.trim()
  if (!trimmed || trimmed.length > MAX_HREF_LENGTH) {
    return null
  }
  const colon = trimmed.indexOf(':')
  const scheme = trimmed.slice(0, colon + 1).toLowerCase()
  const rest = trimmed.slice(colon + 1)
  const queryAt = rest.indexOf('?')
  const path = queryAt === -1 ? rest : rest.slice(0, queryAt)
  const domain = parseDomainQuery(queryAt === -1 ? undefined : rest.slice(queryAt + 1))
  if (domain === null) {
    return null
  }
  const parts = path.split('/')
  const withDomain = domain === undefined ? {} : { domain }
  const [teamId, second, ts, threadTs] = parts
  if (!isNativeChatSlackTeamId(teamId)) {
    return null
  }
  if (scheme === NATIVE_CHAT_SLACK_USER_SCHEME) {
    return parts.length === 2 && isNativeChatSlackUserId(second)
      ? { kind: 'user', teamId, userId: second, ...withDomain }
      : null
  }
  if (!isNativeChatSlackConversationId(second)) {
    return null
  }
  if (scheme === NATIVE_CHAT_SLACK_CHANNEL_SCHEME) {
    return parts.length === 2 ? { kind: 'channel', teamId, channelId: second, ...withDomain } : null
  }
  if (scheme !== NATIVE_CHAT_SLACK_MESSAGE_SCHEME || parts.length < 3 || parts.length > 4) {
    return null
  }
  if (!isNativeChatSlackTs(ts) || (threadTs !== undefined && !isNativeChatSlackTs(threadTs))) {
    return null
  }
  return {
    kind: 'message',
    teamId,
    channelId: second,
    ts,
    ...(threadTs !== undefined && threadTs !== ts ? { threadTs } : {}),
    ...withDomain
  }
}

/** The href for a target; the inverse of parseNativeChatSlackHref. */
export function buildNativeChatSlackHref(target: NativeChatSlackTarget): string {
  const query = target.domain === undefined ? '' : `?d=${target.domain}`
  if (target.kind === 'user') {
    return `${NATIVE_CHAT_SLACK_USER_SCHEME}${target.teamId}/${target.userId}${query}`
  }
  if (target.kind === 'channel') {
    return `${NATIVE_CHAT_SLACK_CHANNEL_SCHEME}${target.teamId}/${target.channelId}${query}`
  }
  const thread = target.threadTs === undefined ? '' : `/${target.threadTs}`
  return `${NATIVE_CHAT_SLACK_MESSAGE_SCHEME}${target.teamId}/${target.channelId}/${target.ts}${thread}${query}`
}
