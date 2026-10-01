import { describe, expect, it } from 'vitest'
import {
  nativeChatSlackConversationTarget,
  nativeChatSlackMessageCardTarget,
  nativeChatSlackPersonTarget,
  parseNativeChatSlackDraftCard,
  parseNativeChatSlackMessageCard
} from './native-chat-slack-card-payload'
import { parseNativeChatSlackImageResult } from './native-chat-slack-image-contract'
import { normalizeNativeChatSlackImagePath } from './native-chat-slack-image-path'

// Made-up ids, names and text only.
const MESSAGE = {
  status: 'needs-you',
  teamId: 'TFAKE0001',
  domain: 'acme',
  from: { name: 'Sam', userId: 'UFAKE0002', avatar: 'avatars/UFAKE0002.png' },
  channel: { name: 'design-review', id: 'CFAKE0003', kind: 'channel' },
  ts: '1700000000.000100',
  threadTs: null,
  sentAt: '2026-10-01T16:47:00+03:00',
  permalink: 'https://acme.slack.com/archives/CFAKE0003/p1700000000000100',
  summary: 'Wants a call on the sidebar: overlay or push?',
  text: 'Which do you prefer, *overlay* or _push_?',
  images: [{ path: 'FFAKE0004/mock.png', name: 'mock.png', width: 1200, height: 800 }],
  thread: { replies: 3, youReplied: false },
  actions: [
    { label: 'Overlay', reply: 'Draft a reply to Sam going with overlay', style: 'primary' },
    { label: 'Reply…', input: true }
  ]
}

const DRAFT = {
  teamId: 'TFAKE0001',
  to: { name: 'Sam', userId: 'UFAKE0002' },
  channel: { name: 'design-review', id: 'CFAKE0003' },
  threadTs: '1700000000.000100',
  text: 'Going with overlay, thanks!',
  actions: [
    { label: 'Send', reply: 'Send the draft to Sam', style: 'primary' },
    { label: 'Edit…', input: true },
    { label: 'Cancel', reply: 'Cancel the draft to Sam' }
  ]
}

function withField(base: object, key: string, value: unknown): string {
  return JSON.stringify({ ...base, [key]: value })
}

describe('parseNativeChatSlackMessageCard', () => {
  it('reads the documented shape', () => {
    expect(parseNativeChatSlackMessageCard(JSON.stringify(MESSAGE))).toEqual({
      status: 'needs-you',
      teamId: 'TFAKE0001',
      domain: 'acme',
      from: { name: 'Sam', userId: 'UFAKE0002', avatar: 'avatars/UFAKE0002.png' },
      channel: { name: 'design-review', id: 'CFAKE0003', kind: 'channel' },
      ts: '1700000000.000100',
      sentAt: '2026-10-01T16:47:00+03:00',
      permalink: 'https://acme.slack.com/archives/CFAKE0003/p1700000000000100',
      summary: 'Wants a call on the sidebar: overlay or push?',
      text: 'Which do you prefer, *overlay* or _push_?',
      images: [{ path: 'FFAKE0004/mock.png', name: 'mock.png', width: 1200, height: 800 }],
      thread: { replies: 3, youReplied: false },
      actions: [
        {
          id: 'action-0',
          kind: 'reply',
          label: 'Overlay',
          reply: 'Draft a reply to Sam going with overlay',
          style: 'primary'
        },
        { id: 'action-1', kind: 'input', label: 'Reply…', style: 'secondary' }
      ]
    })
  })

  it('needs only team, sender, channel, ts and summary', () => {
    expect(
      parseNativeChatSlackMessageCard(
        JSON.stringify({
          teamId: 'TFAKE0001',
          from: { name: 'Sam' },
          channel: { id: 'DFAKE0005' },
          ts: '1700000000.000100',
          summary: 'Asked for the deck'
        })
      )
    ).toEqual({
      status: 'needs-you',
      teamId: 'TFAKE0001',
      from: { name: 'Sam' },
      channel: { id: 'DFAKE0005', kind: 'dm' },
      ts: '1700000000.000100',
      summary: 'Asked for the deck',
      images: [],
      actions: []
    })
  })

  it('keeps a thread parent and drops one equal to the message', () => {
    const reply = parseNativeChatSlackMessageCard(
      JSON.stringify({ ...MESSAGE, permalink: null, threadTs: '1699999999.000050' })
    )
    expect(reply?.threadTs).toBe('1699999999.000050')
    const parent = parseNativeChatSlackMessageCard(withField(MESSAGE, 'threadTs', MESSAGE.ts))
    expect(parent?.threadTs).toBeUndefined()
  })

  it('cuts an absolute cache path down to its cache-relative part', () => {
    const card = parseNativeChatSlackMessageCard(
      withField(MESSAGE, 'images', [
        { path: '/Users/someone/Library/Caches/slack-mcp/files/FFAKE0004/mock.png' }
      ])
    )
    expect(card?.images).toEqual([{ path: 'FFAKE0004/mock.png' }])
  })

  it.each([
    ['bad JSON', '{"teamId": "TFAKE0001",'],
    ['an array', '[]'],
    ['an unknown top-level key', withField(MESSAGE, 'priority', 'high')],
    ['an unknown status', withField(MESSAGE, 'status', 'urgent')],
    ['a bad team id', withField(MESSAGE, 'teamId', 'acme')],
    ['a lowercase team id', withField(MESSAGE, 'teamId', 'tfake0001')],
    ['a full-host domain', withField(MESSAGE, 'domain', 'acme.slack.com')],
    ['a sender with no name', withField(MESSAGE, 'from', { userId: 'UFAKE0002' })],
    [
      'a sender with a channel id',
      withField(MESSAGE, 'from', { name: 'Sam', userId: 'CFAKE0003' })
    ],
    ['a sender with an unknown key', withField(MESSAGE, 'from', { name: 'Sam', email: 'x' })],
    [
      'an avatar outside the cache',
      withField(MESSAGE, 'from', { name: 'Sam', avatar: '/etc/passwd.png' })
    ],
    ['a channel with a user id', withField(MESSAGE, 'channel', { id: 'UFAKE0002' })],
    ['an unknown channel kind', withField(MESSAGE, 'channel', { id: 'CFAKE0003', kind: 'forum' })],
    ['a ts without decimals', withField(MESSAGE, 'ts', '1700000000')],
    ['a numeric ts', withField(MESSAGE, 'ts', 1700000000.0001)],
    ['a bad thread ts', withField(MESSAGE, 'threadTs', 'yesterday')],
    ['a date without an offset', withField(MESSAGE, 'sentAt', '2026-10-01T16:47:00')],
    ['a non-date', withField(MESSAGE, 'sentAt', 'teatime')],
    [
      'an http permalink',
      withField(MESSAGE, 'permalink', MESSAGE.permalink.replace('https', 'http'))
    ],
    [
      'a permalink off slack.com',
      withField(
        MESSAGE,
        'permalink',
        'https://acme.example.com/archives/CFAKE0003/p1700000000000100'
      )
    ],
    [
      'a permalink to another message',
      withField(MESSAGE, 'permalink', 'https://acme.slack.com/archives/CFAKE0003/p1700000000000999')
    ],
    [
      'a permalink on another workspace',
      withField(
        MESSAGE,
        'permalink',
        'https://other.slack.com/archives/CFAKE0003/p1700000000000100'
      )
    ],
    ['a missing summary', withField(MESSAGE, 'summary', undefined)],
    ['a blank summary', withField(MESSAGE, 'summary', '  ')],
    ['an overlong summary', withField(MESSAGE, 'summary', 'x'.repeat(601))],
    ['an overlong text', withField(MESSAGE, 'text', 'x'.repeat(8001))],
    ['images that are not a list', withField(MESSAGE, 'images', {})],
    [
      'seven images',
      withField(
        MESSAGE,
        'images',
        Array.from({ length: 7 }, () => ({ path: 'a.png' }))
      )
    ],
    ['an image that escapes the cache', withField(MESSAGE, 'images', [{ path: '../secret.png' }])],
    ['an image that is not an image', withField(MESSAGE, 'images', [{ path: 'notes.txt' }])],
    ['an image with a zero width', withField(MESSAGE, 'images', [{ path: 'a.png', width: 0 }])],
    ['an image with an unknown key', withField(MESSAGE, 'images', [{ path: 'a.png', url: 'x' }])],
    [
      'a thread with a negative count',
      withField(MESSAGE, 'thread', { replies: -1, youReplied: false })
    ],
    ['a thread missing youReplied', withField(MESSAGE, 'thread', { replies: 2 })],
    [
      'an action with an unknown key',
      withField(MESSAGE, 'actions', [{ label: 'Go', reply: 'go', url: 'x' }])
    ],
    ['an action with no reply', withField(MESSAGE, 'actions', [{ label: 'Go' }])],
    [
      'an unknown action style',
      withField(MESSAGE, 'actions', [{ label: 'Go', reply: 'go', style: 'danger' }])
    ],
    [
      'five actions',
      withField(
        MESSAGE,
        'actions',
        Array.from({ length: 5 }, () => ({ label: 'Go', reply: 'go' }))
      )
    ]
  ])('rejects %s, so the raw block shows', (_name, source) => {
    expect(parseNativeChatSlackMessageCard(source)).toBeNull()
  })
})

describe('parseNativeChatSlackDraftCard', () => {
  it('reads the documented shape', () => {
    expect(parseNativeChatSlackDraftCard(JSON.stringify(DRAFT))).toEqual({
      teamId: 'TFAKE0001',
      to: { name: 'Sam', userId: 'UFAKE0002' },
      channel: { name: 'design-review', id: 'CFAKE0003', kind: 'channel' },
      threadTs: '1700000000.000100',
      text: 'Going with overlay, thanks!',
      actions: [
        {
          id: 'action-0',
          kind: 'reply',
          label: 'Send',
          reply: 'Send the draft to Sam',
          style: 'primary'
        },
        { id: 'action-1', kind: 'input', label: 'Edit…', style: 'secondary' },
        {
          id: 'action-2',
          kind: 'reply',
          label: 'Cancel',
          reply: 'Cancel the draft to Sam',
          style: 'secondary'
        }
      ]
    })
  })

  it('takes a person or a channel alone', () => {
    const { channel: _channel, ...toOnly } = DRAFT
    expect(parseNativeChatSlackDraftCard(JSON.stringify(toOnly))?.to?.name).toBe('Sam')
    const { to: _to, ...channelOnly } = DRAFT
    expect(parseNativeChatSlackDraftCard(JSON.stringify(channelOnly))?.channel?.id).toBe(
      'CFAKE0003'
    )
  })

  it.each([
    ['bad JSON', '{'],
    ['no recipient', JSON.stringify({ teamId: 'TFAKE0001', text: 'hi' })],
    ['no team', withField(DRAFT, 'teamId', undefined)],
    ['no text', withField(DRAFT, 'text', undefined)],
    ['an overlong text', withField(DRAFT, 'text', 'x'.repeat(4001))],
    ['an unknown key', withField(DRAFT, 'sendNow', true)],
    ['a bad thread ts', withField(DRAFT, 'threadTs', '17')],
    ['a recipient with a bad id', withField(DRAFT, 'to', { name: 'Sam', userId: 'sam' })]
  ])('rejects %s', (_name, source) => {
    expect(parseNativeChatSlackDraftCard(source)).toBeNull()
  })
})

describe('Slack card targets', () => {
  it('opens a card message, taking the domain from its permalink when not given', () => {
    const { domain: _domain, ...noDomain } = MESSAGE
    const card = parseNativeChatSlackMessageCard(JSON.stringify(noDomain))!
    expect(nativeChatSlackMessageCardTarget(card)).toEqual({
      kind: 'message',
      teamId: 'TFAKE0001',
      channelId: 'CFAKE0003',
      ts: '1700000000.000100',
      domain: 'acme'
    })
  })

  it('builds chip targets for the sender and channel', () => {
    const card = parseNativeChatSlackMessageCard(JSON.stringify(MESSAGE))!
    expect(nativeChatSlackPersonTarget(card, card.from)).toEqual({
      kind: 'user',
      teamId: 'TFAKE0001',
      userId: 'UFAKE0002',
      domain: 'acme'
    })
    expect(nativeChatSlackPersonTarget(card, { name: 'Bot' })).toBeNull()
    expect(nativeChatSlackConversationTarget(card, card.channel)).toEqual({
      kind: 'channel',
      teamId: 'TFAKE0001',
      channelId: 'CFAKE0003',
      domain: 'acme'
    })
  })
})

describe('normalizeNativeChatSlackImagePath', () => {
  it.each([
    ['FFAKE0004/mock.png', 'FFAKE0004/mock.png'],
    ['shot.JPEG', 'shot.JPEG'],
    ['~/Library/Caches/slack-mcp/files/a/b.webp', 'a/b.webp'],
    ['/Users/someone/Library/Caches/slack-mcp/files/c.gif', 'c.gif']
  ])('takes %s as %s', (input, output) => {
    expect(normalizeNativeChatSlackImagePath(input)).toBe(output)
  })

  it.each([
    ['a parent segment', 'a/../b.png'],
    ['a leading parent', '../b.png'],
    ['a dot segment', './b.png'],
    ['an empty segment', 'a//b.png'],
    ['a backslash', 'a\\b.png'],
    ['a NUL byte', 'a\0.png'],
    ['an absolute path elsewhere', '/tmp/b.png'],
    ['the cache root itself', '/Users/someone/Library/Caches/slack-mcp/files/'],
    ['no extension', 'FFAKE0004/mock'],
    ['an svg', 'logo.svg'],
    ['a non-string', 42],
    ['too long', `${'a/'.repeat(300)}b.png`]
  ])('refuses %s', (_name, input) => {
    expect(normalizeNativeChatSlackImagePath(input)).toBeNull()
  })
})

describe('parseNativeChatSlackImageResult', () => {
  const good = {
    src: 'data:image/png;base64,iVBORw0KGgo=',
    mimeType: 'image/png',
    width: 10,
    height: null,
    byteLength: 8
  }

  it('keeps a well-formed host reply', () => {
    expect(parseNativeChatSlackImageResult(good)).toEqual(good)
  })

  it.each([
    ['null, as an old host or a refusal answers', null],
    ['a non-image data URI', { ...good, src: 'data:text/html;base64,PGI+' }],
    ['an svg', { ...good, src: 'data:image/svg+xml;base64,PHN2Zz4=', mimeType: 'image/svg+xml' }],
    ['a remote URL', { ...good, src: 'https://example.com/a.png' }],
    ['a mime that disagrees with the URI', { ...good, mimeType: 'image/jpeg' }],
    ['a bad width', { ...good, width: -1 }],
    ['no byte length', { ...good, byteLength: undefined }]
  ])('refuses %s', (_name, value) => {
    expect(parseNativeChatSlackImageResult(value)).toBeNull()
  })
})
