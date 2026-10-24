import { describe, expect, it } from 'vitest'
import {
  nativeChatSlackReplyToTarget,
  parseNativeChatSlackDraftCard,
  type NativeChatSlackDraftCard
} from './native-chat-slack-draft-card-payload'

// Made-up ids, names and text only.
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

const REPLY_TO = {
  from: { name: 'Sam', userId: 'UFAKE0002' },
  text: 'Overlay or *push*?',
  ts: '1700000000.000200',
  permalink: 'https://acme.slack.com/archives/CFAKE0003/p1700000000000200'
}

const CHAT_DRAFT = {
  platform: 'whatsapp',
  chat: { name: 'Mum', id: '447700900123@s.whatsapp.net' },
  replyTo: { from: { name: 'Mum' }, text: 'Are you coming Sunday?' },
  text: 'Yes, see you at 1!',
  actions: [{ label: 'Send', reply: 'Send the WhatsApp draft to Mum', style: 'primary' }]
}

function withField(base: Readonly<Record<string, unknown>>, key: string, value: unknown): string {
  return JSON.stringify({ ...base, [key]: value })
}

function slackDraft(source: string): NativeChatSlackDraftCard {
  const card = parseNativeChatSlackDraftCard(source)
  if (card?.platform !== 'slack') {
    throw new Error('expected a Slack draft')
  }
  return card
}

describe('parseNativeChatSlackDraftCard', () => {
  it('reads the documented shape', () => {
    expect(parseNativeChatSlackDraftCard(JSON.stringify(DRAFT))).toEqual({
      platform: 'slack',
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
    expect(slackDraft(JSON.stringify(toOnly)).to?.name).toBe('Sam')
    const { to: _to, ...channelOnly } = DRAFT
    expect(slackDraft(JSON.stringify(channelOnly)).channel?.id).toBe('CFAKE0003')
  })

  it.each([
    ['bad JSON', '{'],
    ['no recipient', JSON.stringify({ teamId: 'TFAKE0001', text: 'hi' })],
    ['no team', withField(DRAFT, 'teamId', undefined)],
    ['no text', withField(DRAFT, 'text', undefined)],
    ['an overlong text', withField(DRAFT, 'text', 'x'.repeat(4001))],
    ['an unknown key', withField(DRAFT, 'sendNow', true)],
    ['a bad thread ts', withField(DRAFT, 'threadTs', '17')],
    ['a recipient with a bad id', withField(DRAFT, 'to', { name: 'Sam', userId: 'sam' })],
    ['an unknown platform', withField(DRAFT, 'platform', 'email')],
    ['a Slack draft with a chat', withField(DRAFT, 'chat', { name: 'Sam' })],
    ['a quote with an unknown key', withField(DRAFT, 'replyTo', { ...REPLY_TO, avatar: 'x.png' })],
    ['an overlong quote', withField(DRAFT, 'replyTo', { ...REPLY_TO, text: 'x'.repeat(601) })],
    ['a quote with a bad ts', withField(DRAFT, 'replyTo', { ...REPLY_TO, ts: 1700000000 })],
    ['a permalink without a ts', withField(DRAFT, 'replyTo', { ...REPLY_TO, ts: undefined })],
    [
      'a permalink to another message',
      withField(DRAFT, 'replyTo', { ...REPLY_TO, ts: '1700000000.000300' })
    ],
    [
      'a permalink in another channel',
      withField(DRAFT, 'replyTo', {
        ...REPLY_TO,
        permalink: 'https://acme.slack.com/archives/CFAKE0009/p1700000000000200'
      })
    ]
  ])('rejects %s', (_name, source) => {
    expect(parseNativeChatSlackDraftCard(source)).toBeNull()
  })
})

describe('replyTo', () => {
  it('quotes the Slack message it answers and links to it in its thread', () => {
    const card = slackDraft(withField(DRAFT, 'replyTo', REPLY_TO))
    expect(card.replyTo).toEqual({ ...REPLY_TO, channelId: 'CFAKE0003' })
    expect(nativeChatSlackReplyToTarget(card)).toEqual({
      kind: 'message',
      teamId: 'TFAKE0001',
      channelId: 'CFAKE0003',
      ts: '1700000000.000200',
      threadTs: '1700000000.000100',
      domain: 'acme'
    })
  })

  it('takes the channel from the permalink when the draft names only a person', () => {
    const { channel: _channel, ...toOnly } = DRAFT
    const card = slackDraft(
      withField(toOnly, 'replyTo', {
        ...REPLY_TO,
        permalink: 'https://acme.slack.com/archives/DFAKE0007/p1700000000000200'
      })
    )
    expect(nativeChatSlackReplyToTarget(card)).toMatchObject({
      channelId: 'DFAKE0007',
      domain: 'acme'
    })
  })

  it('has no link without a ts or a known channel', () => {
    const { channel: _channel, ...toOnly } = DRAFT
    const quote = { from: { name: 'Sam' }, text: 'hi', ts: '1700000000.000200' }
    expect(nativeChatSlackReplyToTarget(slackDraft(withField(toOnly, 'replyTo', quote)))).toBeNull()
    const noTs = { from: { name: 'Sam' }, text: 'hi' }
    expect(nativeChatSlackReplyToTarget(slackDraft(withField(DRAFT, 'replyTo', noTs)))).toBeNull()
  })
})

describe('WhatsApp and Messenger drafts', () => {
  it('reads a chat draft with its quote', () => {
    expect(parseNativeChatSlackDraftCard(JSON.stringify(CHAT_DRAFT))).toEqual({
      platform: 'whatsapp',
      chat: { name: 'Mum', id: '447700900123@s.whatsapp.net' },
      replyTo: { from: { name: 'Mum' }, text: 'Are you coming Sunday?' },
      text: 'Yes, see you at 1!',
      actions: [
        {
          id: 'action-0',
          kind: 'reply',
          label: 'Send',
          reply: 'Send the WhatsApp draft to Mum',
          style: 'primary'
        }
      ]
    })
    expect(
      parseNativeChatSlackDraftCard(withField(CHAT_DRAFT, 'platform', 'messenger'))?.platform
    ).toBe('messenger')
  })

  it.each([
    ['no chat', withField(CHAT_DRAFT, 'chat', undefined)],
    ['a chat with no name', withField(CHAT_DRAFT, 'chat', { id: '1' })],
    ['a chat id with a newline', withField(CHAT_DRAFT, 'chat', { name: 'Mum', id: 'a\nb' })],
    ['a Slack team id', withField(CHAT_DRAFT, 'teamId', 'TFAKE0001')],
    ['a Slack recipient', withField(CHAT_DRAFT, 'to', { name: 'Mum' })],
    ['a Slack thread', withField(CHAT_DRAFT, 'threadTs', '1700000000.000100')],
    [
      'a quote with a Slack user id',
      withField(CHAT_DRAFT, 'replyTo', { from: { name: 'Mum', userId: 'UFAKE0002' }, text: 'hi' })
    ],
    [
      'a quote with a ts',
      withField(CHAT_DRAFT, 'replyTo', { ...CHAT_DRAFT.replyTo, ts: '1700000000.000100' })
    ]
  ])('rejects %s', (_name, source) => {
    expect(parseNativeChatSlackDraftCard(source)).toBeNull()
  })
})
