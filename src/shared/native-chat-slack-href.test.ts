import { describe, expect, it } from 'vitest'
import {
  buildNativeChatSlackHref,
  isNativeChatSlackHref,
  parseNativeChatSlackHref
} from './native-chat-slack-href'
import {
  buildNativeChatSlackLinks,
  buildNativeChatSlackPermalink,
  parseNativeChatSlackPermalink
} from './native-chat-slack-links'
import { isNativeChatSlackDomain } from './native-chat-slack-ids'

// Made-up ids only.
const T = 'TFAKE0001'
const U = 'UFAKE0002'
const C = 'CFAKE0003'
const TS = '1700000000.000100'
const PARENT = '1699999999.000050'

describe('parseNativeChatSlackHref', () => {
  it.each([
    [`slack-user:${T}/${U}`, { kind: 'user', teamId: T, userId: U }],
    [`slack-user:${T}/WFAKE0004`, { kind: 'user', teamId: T, userId: 'WFAKE0004' }],
    [`slack-channel:${T}/${C}`, { kind: 'channel', teamId: T, channelId: C }],
    [`slack-channel:${T}/DFAKE0005`, { kind: 'channel', teamId: T, channelId: 'DFAKE0005' }],
    [
      `slack-channel:${T}/GFAKE0006?d=acme`,
      { kind: 'channel', teamId: T, channelId: 'GFAKE0006', domain: 'acme' }
    ],
    [`slack-message:${T}/${C}/${TS}`, { kind: 'message', teamId: T, channelId: C, ts: TS }],
    [
      `slack-message:${T}/${C}/${TS}/${PARENT}?d=acme`,
      { kind: 'message', teamId: T, channelId: C, ts: TS, threadTs: PARENT, domain: 'acme' }
    ],
    // A thread parent equal to the message is the message itself.
    [`slack-message:${T}/${C}/${TS}/${TS}`, { kind: 'message', teamId: T, channelId: C, ts: TS }],
    [`  SLACK-USER:${T}/${U}  `, { kind: 'user', teamId: T, userId: U }]
  ])('reads %s', (href, target) => {
    expect(parseNativeChatSlackHref(href)).toEqual(target)
  })

  it.each([
    ['another scheme', `orca-worktree:${T}/${U}`],
    ['no team', `slack-user:${U}`],
    ['a lowercase id', `slack-user:${T}/ufake0002`],
    ['a channel id as a user', `slack-user:${T}/${C}`],
    ['a user id as a channel', `slack-channel:${T}/${U}`],
    ['an extra segment', `slack-user:${T}/${U}/x`],
    ['a ts without a dot', `slack-message:${T}/${C}/1700000000000100`],
    ['a ts with five decimals', `slack-message:${T}/${C}/1700000000.00010`],
    ['a bad thread ts', `slack-message:${T}/${C}/${TS}/later`],
    ['too many segments', `slack-message:${T}/${C}/${TS}/${PARENT}/${PARENT}`],
    ['an unknown query key', `slack-user:${T}/${U}?x=1`],
    ['a second query key', `slack-user:${T}/${U}?d=acme&x=1`],
    ['a full host as domain', `slack-user:${T}/${U}?d=acme.slack.com`],
    ['a domain with a slash', `slack-user:${T}/${U}?d=acme/evil`],
    ['a domain with uppercase', `slack-user:${T}/${U}?d=Acme`],
    ['an empty href', ''],
    ['undefined', undefined]
  ])('rejects %s', (_name, href) => {
    expect(parseNativeChatSlackHref(href)).toBeNull()
  })

  it('round-trips through buildNativeChatSlackHref', () => {
    for (const href of [
      `slack-user:${T}/${U}?d=acme`,
      `slack-channel:${T}/${C}`,
      `slack-message:${T}/${C}/${TS}/${PARENT}?d=acme.enterprise`
    ]) {
      const target = parseNativeChatSlackHref(href)
      expect(target).not.toBeNull()
      expect(buildNativeChatSlackHref(target!)).toBe(href)
    }
  })

  it('recognises the schemes whether or not the link is valid', () => {
    expect(isNativeChatSlackHref('slack-message:nonsense')).toBe(true)
    expect(isNativeChatSlackHref('slack://user?team=x')).toBe(false)
    expect(isNativeChatSlackHref('https://acme.slack.com')).toBe(false)
  })
})

describe('isNativeChatSlackDomain', () => {
  it('takes subdomains and dotted Grid labels only', () => {
    expect(isNativeChatSlackDomain('acme')).toBe(true)
    expect(isNativeChatSlackDomain('acme-team.enterprise')).toBe(true)
    expect(isNativeChatSlackDomain('-acme')).toBe(false)
    expect(isNativeChatSlackDomain('acme.slack.com')).toBe(false)
    expect(isNativeChatSlackDomain('')).toBe(false)
    expect(isNativeChatSlackDomain('a'.repeat(101))).toBe(false)
  })
})

describe('buildNativeChatSlackLinks', () => {
  it('opens a person as a DM deep link, with their profile as the web fallback', () => {
    expect(buildNativeChatSlackLinks({ kind: 'user', teamId: T, userId: U })).toEqual({
      primary: `slack://user?team=${T}&id=${U}`,
      fallback: null
    })
    expect(
      buildNativeChatSlackLinks({ kind: 'user', teamId: T, userId: U, domain: 'acme' })
    ).toEqual({
      primary: `slack://user?team=${T}&id=${U}`,
      fallback: `https://acme.slack.com/team/${U}`
    })
  })

  it('opens a channel as a deep link, falling back to the archive or app_redirect', () => {
    expect(buildNativeChatSlackLinks({ kind: 'channel', teamId: T, channelId: C })).toEqual({
      primary: `slack://channel?team=${T}&id=${C}`,
      fallback: `https://slack.com/app_redirect?team=${T}&channel=${C}`
    })
    expect(
      buildNativeChatSlackLinks({ kind: 'channel', teamId: T, channelId: C, domain: 'acme' })
        .fallback
    ).toBe(`https://acme.slack.com/archives/${C}`)
  })

  it('opens a message by its permalink when the domain is known', () => {
    expect(
      buildNativeChatSlackLinks({
        kind: 'message',
        teamId: T,
        channelId: C,
        ts: TS,
        domain: 'acme'
      })
    ).toEqual({
      primary: `https://acme.slack.com/archives/${C}/p1700000000000100`,
      fallback: `slack://channel?team=${T}&id=${C}`
    })
  })

  it('opens a thread reply inside its thread', () => {
    expect(
      buildNativeChatSlackLinks({
        kind: 'message',
        teamId: T,
        channelId: C,
        ts: TS,
        threadTs: PARENT,
        domain: 'acme'
      }).primary
    ).toBe(`https://acme.slack.com/archives/${C}/p1700000000000100?thread_ts=${PARENT}&cid=${C}`)
  })

  it('never guesses a domain: without one a message opens its channel', () => {
    expect(buildNativeChatSlackLinks({ kind: 'message', teamId: T, channelId: C, ts: TS })).toEqual(
      {
        primary: `slack://channel?team=${T}&id=${C}`,
        fallback: `https://slack.com/app_redirect?team=${T}&channel=${C}`
      }
    )
  })
})

describe('parseNativeChatSlackPermalink', () => {
  const expected = { channelId: C, ts: TS }
  const plain = buildNativeChatSlackPermalink({ domain: 'acme', channelId: C, ts: TS })
  const threaded = buildNativeChatSlackPermalink({
    domain: 'acme',
    channelId: C,
    ts: TS,
    threadTs: PARENT
  })

  it('keeps a permalink for this exact message', () => {
    expect(parseNativeChatSlackPermalink(plain, expected)).toBe(plain)
    expect(parseNativeChatSlackPermalink(threaded, expected)).toBe(threaded)
    expect(parseNativeChatSlackPermalink(plain, { ...expected, domain: 'acme' })).toBe(plain)
  })

  it.each([
    ['http', plain.replace('https:', 'http:')],
    ['another host', `https://acme.example.com/archives/${C}/p1700000000000100`],
    ['a lookalike host', `https://acme.slack.com.example.com/archives/${C}/p1700000000000100`],
    ['the app host', `https://app.slack.com/archives/${C}/p1700000000000100`],
    ['credentials', `https://user:pass@acme.slack.com/archives/${C}/p1700000000000100`],
    ['a port', `https://acme.slack.com:8443/archives/${C}/p1700000000000100`],
    ['a fragment', `${plain}#x`],
    ['another channel', plain.replace(C, 'CFAKE0009')],
    ['another message', plain.replace('p1700000000000100', 'p1700000000000101')],
    ['an extra query key', `${plain}?x=1`],
    ['a mismatched cid', `${plain}?thread_ts=${PARENT}&cid=CFAKE0009`],
    ['not a URL', 'acme.slack.com/archives']
  ])('refuses %s', (_name, link) => {
    expect(parseNativeChatSlackPermalink(link, expected)).toBeNull()
  })

  it('refuses a permalink on another workspace than the card names', () => {
    expect(parseNativeChatSlackPermalink(plain, { ...expected, domain: 'other' })).toBeNull()
  })
})
