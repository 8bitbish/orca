// Where a Slack chip or card opens. `primary` is tried first; `fallback` is for when
// it cannot open (no Slack app registered for slack://, say). Built only from a
// validated target, so no reply text reaches a URL unchecked.
//
// slack://user and slack://channel are Slack's documented deep links on macOS,
// Windows, iOS and Android. Slack documents no slack:// link to a message, so a
// message opens through its https permalink, which the Android app claims as an
// app link and which the desktop browser hands to the Slack app. Without the
// workspace domain no permalink can be built, so the message's channel opens.

import type { NativeChatSlackTarget } from './native-chat-slack-href'
import { isNativeChatSlackDomain } from './native-chat-slack-ids'

export type NativeChatSlackLinks = { primary: string; fallback: string | null }

function query(params: Record<string, string>): string {
  return new URLSearchParams(params).toString()
}

function workspaceOrigin(domain: string): string {
  return `https://${domain}.slack.com`
}

/** The https permalink Slack's chat.getPermalink returns for this message. */
export function buildNativeChatSlackPermalink(args: {
  domain: string
  channelId: string
  ts: string
  threadTs?: string
}): string {
  const base = `${workspaceOrigin(args.domain)}/archives/${args.channelId}/p${args.ts.replace('.', '')}`
  return args.threadTs === undefined || args.threadTs === args.ts
    ? base
    : `${base}?${query({ thread_ts: args.threadTs, cid: args.channelId })}`
}

function channelDeepLink(teamId: string, channelId: string): string {
  return `slack://channel?${query({ team: teamId, id: channelId })}`
}

function channelWebLink(teamId: string, channelId: string, domain: string | undefined): string {
  return domain === undefined
    ? `https://slack.com/app_redirect?${query({ team: teamId, channel: channelId })}`
    : `${workspaceOrigin(domain)}/archives/${channelId}`
}

export function buildNativeChatSlackLinks(target: NativeChatSlackTarget): NativeChatSlackLinks {
  if (target.kind === 'user') {
    return {
      primary: `slack://user?${query({ team: target.teamId, id: target.userId })}`,
      fallback:
        target.domain === undefined
          ? null
          : `${workspaceOrigin(target.domain)}/team/${target.userId}`
    }
  }
  if (target.kind === 'channel') {
    return {
      primary: channelDeepLink(target.teamId, target.channelId),
      fallback: channelWebLink(target.teamId, target.channelId, target.domain)
    }
  }
  if (target.domain === undefined) {
    return {
      primary: channelDeepLink(target.teamId, target.channelId),
      fallback: channelWebLink(target.teamId, target.channelId, undefined)
    }
  }
  return {
    primary: buildNativeChatSlackPermalink({ ...target, domain: target.domain }),
    fallback: channelDeepLink(target.teamId, target.channelId)
  }
}

const PERMALINK_PATH = /^\/archives\/([CDG][A-Z0-9]{2,20})\/p(\d{15,16})$/
const PERMALINK_QUERY_KEYS = new Set(['thread_ts', 'cid'])

/** A card's permalink when it is https on a *.slack.com workspace and names this
 *  exact message; null otherwise. */
export function parseNativeChatSlackPermalink(
  value: string,
  expected: { channelId: string; ts: string; domain?: string }
): string | null {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  const host = url.hostname
  const path = PERMALINK_PATH.exec(url.pathname)
  if (
    url.protocol !== 'https:' ||
    url.username !== '' ||
    url.password !== '' ||
    url.port !== '' ||
    url.hash !== '' ||
    !host.endsWith('.slack.com') ||
    !isNativeChatSlackDomain(host.slice(0, -'.slack.com'.length)) ||
    host === 'app.slack.com' ||
    (expected.domain !== undefined && host !== `${expected.domain}.slack.com`) ||
    !path ||
    path[1] !== expected.channelId ||
    path[2] !== expected.ts.replace('.', '') ||
    [...url.searchParams.keys()].some((key) => !PERMALINK_QUERY_KEYS.has(key))
  ) {
    return null
  }
  const cid = url.searchParams.get('cid')
  return cid === null || cid === expected.channelId ? url.toString() : null
}
