import { describe, expect, it } from 'vitest'
import {
  nativeChatCardPressMatches,
  nativeChatCardPressMessage,
  nativeChatDraftCardPress,
  nativeChatProjectCardPress,
  nativeChatProofCardPress,
  nativeChatSlackMessageCardPress,
  splitNativeChatCardPressTag,
  withoutNativeChatCardPressTag
} from './native-chat-card-press'
import { deriveNativeChatProjectCardChoice } from './native-chat-project-card-choice'
import { parseNativeChatProjectCardPayload } from './native-chat-project-card-payload'
import { parseNativeChatProofCard } from './native-chat-proof-card-reader'
import { parseNativeChatSlackMessageCard } from './native-chat-slack-card-payload'
import { parseNativeChatSlackDraftCard } from './native-chat-slack-draft-card-payload'
import type { NativeChatMessage } from './native-chat-types'

function tagOf(text: string): Record<string, unknown> {
  const tag = splitNativeChatCardPressTag(text).tag
  expect(tag).not.toBeNull()
  return tag ?? {}
}

function parsed<T>(value: T | null): T {
  if (value === null) {
    throw new Error('fixture did not parse')
  }
  return value
}

describe('card presses', () => {
  it('names a proof card, its repo and its bundle', () => {
    const card = parsed(
      parseNativeChatProofCard(
        JSON.stringify({
          worktree: 'ca-food-bank-pwa/cart',
          title: 'Cart cards and request locations',
          media: [
            {
              type: 'image',
              path: '/Users/jb/.orca-personal/proof/ca-food-bank-pwa/2026-10-28-cart/1-before.jpg'
            }
          ],
          actions: [
            { label: 'Install it', reply: 'Install it' },
            { label: 'Needs changes', input: true }
          ]
        })
      )
    )
    const sent = nativeChatCardPressMessage(
      nativeChatProofCardPress(card),
      'Install it',
      'Install it'
    )
    const [line, tagLine] = sent.split('\n')
    expect(line).toBe('Re: ca-food-bank-pwa · Cart cards and request locations: Install it')
    expect(
      tagLine.startsWith('[companion-context] {"v":1,"type":"button","kind":"proof-card"')
    ).toBe(true)
    expect(tagOf(sent)).toEqual({
      v: 1,
      type: 'button',
      kind: 'proof-card',
      title: 'Cart cards and request locations',
      project: 'ca-food-bank-pwa',
      label: 'Install it',
      worktree: 'ca-food-bank-pwa/cart',
      proof: '/Users/jb/.orca-personal/proof/ca-food-bank-pwa/2026-10-28-cart'
    })
    const nested = parsed(
      parseNativeChatProofCard(
        JSON.stringify({
          worktree: 'orca-rap',
          title: 'Search',
          media: [{ type: 'video', path: 'orca-rap/2026-10-14-search/phone/flow.mp4' }]
        })
      )
    )
    expect(nativeChatProofCardPress(nested).refs.proof).toBe(
      '~/.orca-personal/proof/orca-rap/2026-10-14-search'
    )
    // Typed answers get the same line, without a label.
    expect(
      tagOf(nativeChatCardPressMessage(nativeChatProofCardPress(card), ' Logo too big ')).label
    ).toBe(undefined)
  })

  it('titles a project card by its ask, else its note', () => {
    const card = parsed(
      parseNativeChatProjectCardPayload(
        JSON.stringify({
          worktree: 'lull/flicker',
          note: 'Fixed the flicker',
          ask: 'Install the build?\nIt is signed.',
          actions: [{ label: 'Yes', reply: 'Install it' }]
        })
      )
    )
    expect(
      nativeChatCardPressMessage(nativeChatProjectCardPress(card), 'Install it').split('\n')[0]
    ).toBe('Re: lull · Install the build?: Install it')
  })

  it('names a Slack message by sender, channel and summary', () => {
    const card = parsed(
      parseNativeChatSlackMessageCard(
        JSON.stringify({
          status: 'needs-you',
          teamId: 'TFAKE0001',
          from: { name: 'Tayler' },
          channel: { id: 'CFAKE0003', name: 'design', kind: 'channel' },
          ts: '1793344499.000100',
          summary: 'Can you check the new cart screens before the client call this afternoon?',
          images: [],
          actions: [{ label: 'Draft a reply', reply: 'Draft a reply' }]
        })
      )
    )
    const sent = nativeChatCardPressMessage(nativeChatSlackMessageCardPress(card), 'Draft a reply')
    expect(sent.split('\n')[0]).toBe(
      'Re: Slack · Tayler in #design: Can you check the new cart screens before the client call t…: Draft a reply'
    )
    expect(tagOf(sent)).toMatchObject({
      kind: 'slack-message',
      channel: 'CFAKE0003',
      ts: '1793344499.000100'
    })
  })

  it('names a draft by its recipient and platform', () => {
    const slack = parsed(
      parseNativeChatSlackDraftCard(
        JSON.stringify({
          teamId: 'TFAKE0001',
          to: { name: 'Tayler', userId: 'UFAKE0002' },
          channel: { id: 'DFAKE0006' },
          text: 'Looks good',
          actions: [{ label: 'Send', reply: 'Send the draft to Tayler' }]
        })
      )
    )
    expect(
      nativeChatCardPressMessage(nativeChatDraftCardPress(slack), 'Send the draft to Tayler').split(
        '\n'
      )[0]
    ).toBe('Re: Slack · Draft to Tayler: Send the draft to Tayler')
    const whatsapp = parsed(
      parseNativeChatSlackDraftCard(
        JSON.stringify({
          platform: 'whatsapp',
          chat: { name: 'Mum', id: '447700900000@c.us' },
          text: 'On my way',
          actions: [{ label: 'Send', reply: 'Send it' }]
        })
      )
    )
    const sent = nativeChatCardPressMessage(nativeChatDraftCardPress(whatsapp), 'Send it')
    expect(sent.split('\n')[0]).toBe('Re: Whatsapp · Draft to Mum: Send it')
    expect(tagOf(sent).chat).toBe('447700900000@c.us')
  })

  it('reads a press back as its reply, and the card as chosen', () => {
    const press = { kind: 'proof-card' as const, title: 'Cart', project: 'cfb', refs: {} }
    const sent = nativeChatCardPressMessage(press, 'Redo it', 'Redo')
    expect(splitNativeChatCardPressTag(sent).shown).toBe('Re: cfb · Cart: Redo it')
    expect(nativeChatCardPressMatches(sent, 'Redo it')).toBe(true)
    expect(nativeChatCardPressMatches('Redo it', 'Redo it')).toBe(true)
    expect(nativeChatCardPressMatches(sent, 'Looks right')).toBe(false)
    expect(nativeChatCardPressMatches('please redo it', 'Redo it')).toBe(false)

    const messages: NativeChatMessage[] = [
      {
        id: 'a',
        role: 'assistant',
        blocks: [{ type: 'text', text: 'card' }],
        timestamp: 1,
        source: 'transcript'
      },
      {
        id: 'u',
        role: 'user',
        blocks: [{ type: 'text', text: sent }],
        timestamp: 2,
        source: 'transcript'
      }
    ]
    const choice = deriveNativeChatProjectCardChoice({
      actions: [
        { id: '0', label: 'Looks right', style: 'primary', kind: 'reply', reply: 'Looks right' },
        { id: '1', label: 'Redo', style: 'secondary', kind: 'reply', reply: 'Redo it' }
      ],
      messages,
      messageId: 'a',
      recordedInput: null
    })
    expect(choice).toEqual({ actionIndex: 1, text: 'Redo it' })
    expect(withoutNativeChatCardPressTag(messages[1].blocks)).toEqual([
      { type: 'text', text: 'Re: cfb · Cart: Redo it' }
    ])
  })

  it('leaves text with no valid tag alone', () => {
    const text = 'see [companion-context] {not json'
    expect(splitNativeChatCardPressTag(text)).toEqual({ shown: text, tag: null })
  })
})
