// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DRAFT_CARD, renderSlackFence, stubSlackApi } from './native-chat-slack-card-test-fixtures'

let api: ReturnType<typeof stubSlackApi>

beforeEach(() => {
  api = stubSlackApi()
})

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.unstubAllGlobals()
})

function draft(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({ ...DRAFT_CARD, ...overrides })
}

describe('NativeChatSlackDraftCard', () => {
  it('names bare <@U…> mentions from the host cache and keeps <@U…|name> labels', async () => {
    renderSlackFence(
      'slack-draft',
      draft({ to: undefined, text: 'Thanks <@UFAKE0010> <@UFAKE0011>, cc <@UFAKE0099|Mo>' }),
      { send: vi.fn(), canSend: true, messages: [] }
    )
    for (const name of ['@Ada', '@Linus', '@Mo']) {
      expect(await screen.findByRole('button', { name: new RegExp(`^${name}`) })).toHaveAttribute(
        'data-native-chat-slack-chip',
        'user'
      )
    }
    expect(screen.queryByText(/UFAKE00/)).toBeNull()
    // The labelled mention is not looked up.
    expect(api.slackNames).toHaveBeenCalledWith({
      userIds: ['UFAKE0010', 'UFAKE0011'],
      channelIds: []
    })
  })

  it('names <#C…> channel mentions, and the card’s own recipient without a lookup', async () => {
    renderSlackFence('slack-draft', draft({ text: 'Moving to <#CFAKE0013> with <@UFAKE0002>' }), {
      send: vi.fn(),
      canSend: true,
      messages: []
    })
    expect(await screen.findByRole('button', { name: /^#launch/ })).toHaveAttribute(
      'data-native-chat-slack-chip',
      'channel'
    )
    expect(screen.getAllByRole('button', { name: /^@Sam/ }).length).toBeGreaterThan(0)
    expect(api.slackNames).toHaveBeenCalledWith({ userIds: [], channelIds: ['CFAKE0013'] })
  })

  it('falls back to the id when the cache does not know it, or the host lacks the call', async () => {
    api.slackNames.mockRejectedValueOnce(new Error('method_not_found'))
    renderSlackFence('slack-draft', draft({ text: 'Ping <@UFAKE0098>' }), {
      send: vi.fn(),
      canSend: true,
      messages: []
    })
    await waitFor(() => expect(api.slackNames).toHaveBeenCalled())
    expect(screen.getByRole('button', { name: /^@UFAKE0098/ })).toBeInTheDocument()
  })

  it('reads as a draft, not sent, to its person and channel, with the text and actions', () => {
    renderSlackFence('slack-draft', draft(), { send: vi.fn(), canSend: true, messages: [] })
    expect(document.querySelector('[data-native-chat-slack-card="draft"]')).not.toBeNull()
    expect(screen.getByText('Draft, not sent')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Sam/ })).toHaveAttribute(
      'data-native-chat-slack-chip',
      'user'
    )
    expect(screen.getByRole('button', { name: /#design-review/ })).toBeInTheDocument()
    expect(screen.getByText('in thread', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('overlay').tagName).toBe('STRONG')
    expect(
      screen.getByRole('button', { name: /^Send.*Sends “Send the draft to Sam”/ })
    ).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Open in Slack' })).toBeNull()
  })

  it('never sends to Slack or the network: every button only answers in the chat', () => {
    const fetchSpy = vi.fn()
    const openSpy = vi.fn()
    const xhrSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    vi.stubGlobal('XMLHttpRequest', xhrSpy)
    vi.stubGlobal('WebSocket', xhrSpy)
    vi.spyOn(window, 'open').mockImplementation(openSpy)
    const beacon = vi.fn()
    Object.defineProperty(navigator, 'sendBeacon', { value: beacon, configurable: true })

    for (const label of ['Send', 'Cancel', 'Edit…']) {
      cleanup()
      localStorage.clear()
      const send = vi.fn(() => true)
      renderSlackFence('slack-draft', draft(), { send, canSend: true, messages: [] })
      fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${label}`) }))
      if (label === 'Edit…') {
        fireEvent.change(screen.getByRole('textbox', { name: 'Edit…' }), {
          target: { value: 'Make it shorter' }
        })
        fireEvent.click(screen.getByRole('button', { name: 'Send' }))
        expect(send).toHaveBeenCalledWith('Make it shorter')
      } else {
        expect(send).toHaveBeenCalledWith(
          label === 'Send' ? 'Send the draft to Sam' : 'Cancel the draft to Sam'
        )
      }
      expect(send).toHaveBeenCalledTimes(1)
    }

    expect(api.openSlack).not.toHaveBeenCalled()
    expect(api.slackImage).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(xhrSpy).not.toHaveBeenCalled()
    expect(openSpy).not.toHaveBeenCalled()
    expect(beacon).not.toHaveBeenCalled()
    Reflect.deleteProperty(navigator, 'sendBeacon')
  })

  it('draws Slack emoji codes in the draft text', () => {
    renderSlackFence(
      'slack-draft',
      draft({ text: 'Thanks :wave::skin-tone-4: :heart: :custom_one:' }),
      null
    )
    expect(document.querySelector('[data-slack-text]')).toHaveTextContent(
      'Thanks 👋🏽 ❤️ :custom_one:'
    )
  })

  it('has no actions to take outside a chat that can answer', () => {
    renderSlackFence('slack-draft', draft(), null)
    for (const button of screen.getAllByRole('button', { name: /Sends|Type a reply/ })) {
      expect(button).toBeDisabled()
    }
  })

  it.each([
    ['bad JSON', '{"teamId":'],
    ['neither a person nor a channel', draft({ to: undefined, channel: undefined })],
    ['an unknown key', draft({ send: true })],
    ['an over-long text', draft({ text: 'x'.repeat(4001) })]
  ])('shows the raw block for %s', (_label, source) => {
    renderSlackFence('slack-draft', source, null)
    expect(document.querySelector('[data-native-chat-slack-card]')).toBeNull()
    expect(document.querySelector('[data-code-language="slack-draft"]')).not.toBeNull()
  })
})
