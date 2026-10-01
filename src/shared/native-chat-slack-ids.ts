// Slack identifiers as the chat's Slack chips and cards accept them. Every check
// is a whole-string match, so nothing a reply writes can smuggle extra URL syntax
// into a link built from these.

const TEAM_ID = /^T[A-Z0-9]{2,20}$/
// W… is an Enterprise Grid user.
const USER_ID = /^[UW][A-Z0-9]{2,20}$/
// C public, G private or group DM, D direct message.
const CONVERSATION_ID = /^[CDG][A-Z0-9]{2,20}$/
// Slack ts: epoch seconds, a dot, then exactly six digits; the permalink drops the dot.
const MESSAGE_TS = /^\d{9,10}\.\d{6}$/
const DOMAIN_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/
const MAX_DOMAIN_LENGTH = 100

export type NativeChatSlackConversationKind = 'channel' | 'dm' | 'group'

export function isNativeChatSlackTeamId(value: unknown): value is string {
  return typeof value === 'string' && TEAM_ID.test(value)
}

export function isNativeChatSlackUserId(value: unknown): value is string {
  return typeof value === 'string' && USER_ID.test(value)
}

export function isNativeChatSlackConversationId(value: unknown): value is string {
  return typeof value === 'string' && CONVERSATION_ID.test(value)
}

export function isNativeChatSlackTs(value: unknown): value is string {
  return typeof value === 'string' && MESSAGE_TS.test(value)
}

/** The workspace subdomain only (`acme` for acme.slack.com; dotted labels for Grid). */
export function isNativeChatSlackDomain(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_DOMAIN_LENGTH) {
    return false
  }
  const labels = value.split('.')
  // A full host would double up as acme.slack.com.slack.com.
  if (labels.length >= 2 && labels.at(-2) === 'slack' && labels.at(-1) === 'com') {
    return false
  }
  return labels.every((label) => DOMAIN_LABEL.test(label))
}

/** What a conversation id's prefix says it is. */
export function nativeChatSlackConversationKind(id: string): NativeChatSlackConversationKind {
  if (id.startsWith('D')) {
    return 'dm'
  }
  return id.startsWith('G') ? 'group' : 'channel'
}
