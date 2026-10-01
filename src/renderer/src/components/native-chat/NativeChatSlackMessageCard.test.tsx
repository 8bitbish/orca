// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  chatMessage,
  MESSAGE_CARD,
  PIXEL_PNG,
  REPLY_SCOPE,
  renderSlackFence,
  stubSlackApi
} from './native-chat-slack-card-test-fixtures'

let api: ReturnType<typeof stubSlackApi>

beforeEach(() => {
  api = stubSlackApi()
  vi.stubGlobal('IntersectionObserver', undefined)
})

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.unstubAllGlobals()
})

function card(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({ ...MESSAGE_CARD, ...overrides })
}

describe('NativeChatSlackMessageCard', () => {
  it('draws status, sender → channel · time, summary, text, thread line and actions', async () => {
    renderSlackFence('slack-message', card(), { send: vi.fn(), canSend: true, messages: [] })
    const figure = document.querySelector('[data-native-chat-slack-card="message"]')
    expect(figure).not.toBeNull()
    expect(figure).toHaveAttribute('data-slack-status', 'needs-you')
    expect(screen.getByText('Needs you')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Sam/ })).toHaveAttribute(
      'data-native-chat-slack-chip',
      'user'
    )
    expect(screen.getByRole('button', { name: /#design-review/ })).toHaveAttribute(
      'data-native-chat-slack-chip',
      'channel'
    )
    expect(document.querySelector('time')).toHaveAttribute('datetime', MESSAGE_CARD.sentAt)
    expect(screen.getByText(MESSAGE_CARD.summary)).toHaveAttribute('data-slack-summary')
    // mrkdwn renders through the chat's markdown: bold, italic and a mention chip.
    expect(screen.getByText('overlay').tagName).toBe('STRONG')
    expect(screen.getByText('push').tagName).toBe('EM')
    expect(screen.getByRole('button', { name: /Alex/ })).toHaveAttribute(
      'data-native-chat-slack-chip',
      'user'
    )
    expect(document.querySelector('[data-slack-thread]')).toHaveTextContent(
      '3 replies · you haven’t replied'
    )
    expect(
      screen.getByRole('button', {
        name: /Overlay.*Sends “Draft a reply to Sam going with overlay”/
      })
    ).toBeEnabled()
    await waitFor(() => expect(document.querySelector('[data-slack-image] img')).not.toBeNull())
  })

  it('says FYI for an fyi message and "you replied" once replied', () => {
    renderSlackFence(
      'slack-message',
      card({ status: 'fyi', thread: { replies: 1, youReplied: true } }),
      null
    )
    expect(screen.getByText('FYI')).toBeInTheDocument()
    expect(screen.queryByText('Needs you')).toBeNull()
    expect(document.querySelector('[data-slack-thread]')).toHaveTextContent('1 reply · you replied')
  })

  it('opens the message in Slack, reading the domain from the permalink when needed', () => {
    const { unmount } = renderSlackFence('slack-message', card(), null)
    fireEvent.click(screen.getByRole('button', { name: 'Open in Slack' }))
    expect(api.openSlack).toHaveBeenLastCalledWith(
      'slack-message:TFAKE0001/CFAKE0003/1700000000.000100?d=acme'
    )
    unmount()
    renderSlackFence(
      'slack-message',
      card({
        domain: undefined,
        permalink: 'https://acme.slack.com/archives/CFAKE0003/p1700000000000100'
      }),
      null
    )
    fireEvent.click(screen.getByRole('button', { name: 'Open in Slack' }))
    expect(api.openSlack).toHaveBeenLastCalledWith(
      'slack-message:TFAKE0001/CFAKE0003/1700000000.000100?d=acme'
    )
  })

  it('opens a thumbnail full size in the image preview and skips a missing image', async () => {
    renderSlackFence(
      'slack-message',
      card({
        images: [
          { path: 'FFAKE0005/mock.png', name: 'mock.png' },
          { path: 'FFAKE0006/missing.png', name: 'missing.png' }
        ]
      }),
      null
    )
    const thumbnail = await screen.findByRole('button', { name: 'View image: mock.png' })
    await waitFor(() => expect(document.querySelector('[data-slack-image-loading]')).toBeNull())
    expect(screen.queryByRole('button', { name: /missing\.png/ })).toBeNull()
    expect(api.slackImage).toHaveBeenCalledWith({
      path: 'FFAKE0005/mock.png',
      variant: 'thumbnail'
    })
    expect(api.slackImage).not.toHaveBeenCalledWith({ path: 'FFAKE0005/mock.png', variant: 'full' })
    fireEvent.click(thumbnail)
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('img', { name: 'mock.png' })).toHaveAttribute('src', PIXEL_PNG)
    expect(api.slackImage).toHaveBeenCalledWith({ path: 'FFAKE0005/mock.png', variant: 'full' })
  })

  it('never puts a non-raster reply from the host into an image', async () => {
    api.slackImage.mockImplementation(async () => ({
      src: 'data:image/svg+xml;base64,PHN2Zz4=',
      mimeType: 'image/png',
      width: 1,
      height: 1,
      byteLength: 5
    }))
    renderSlackFence('slack-message', card(), null)
    await waitFor(() => expect(document.querySelector('[data-slack-image-loading]')).toBeNull())
    expect(document.querySelector('img')).toBeNull()
  })

  it('sends an action as the next chat message and keeps it chosen', () => {
    const send = vi.fn(() => true)
    renderSlackFence('slack-message', card(), {
      send,
      canSend: true,
      messages: []
    })
    fireEvent.click(screen.getByRole('button', { name: /^Overlay/ }))
    expect(send).toHaveBeenCalledWith('Draft a reply to Sam going with overlay')
    expect(screen.getByText('Sent “Draft a reply to Sam going with overlay”')).toBeInTheDocument()
    expect(api.openSlack).not.toHaveBeenCalled()
    // After a reload the transcript alone marks it chosen.
    cleanup()
    renderSlackFence('slack-message', card(), {
      send,
      canSend: true,
      messages: [
        chatMessage('a1', 'assistant', 'card'),
        chatMessage('u1', 'user', 'Draft a reply to Sam going with overlay')
      ]
    })
    expect(document.querySelector('[data-project-action-chosen="true"]')).toHaveTextContent(
      'Overlay'
    )
  })

  it('clamps long text to three lines with more ▾ / less ▴', () => {
    const scrollHeight = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(200)
    const clientHeight = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(60)
    renderSlackFence('slack-message', card(), null)
    const text = document.querySelector('[data-slack-text]')
    expect(text).toHaveAttribute('data-slack-text', 'collapsed')
    expect(text?.firstElementChild).toHaveClass('line-clamp-3')
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'more ▾' }))
    })
    expect(text).toHaveAttribute('data-slack-text', 'expanded')
    expect(text?.firstElementChild).not.toHaveClass('line-clamp-3')
    fireEvent.click(screen.getByRole('button', { name: 'less ▴' }))
    expect(text).toHaveAttribute('data-slack-text', 'collapsed')
    scrollHeight.mockRestore()
    clientHeight.mockRestore()
  })

  it('hides the toggle when the text fits', () => {
    renderSlackFence('slack-message', card({ text: 'Short one' }), null)
    expect(screen.queryByRole('button', { name: 'more ▾' })).toBeNull()
  })

  it.each([
    ['bad JSON', '{"teamId": "TFAKE0001",'],
    ['an unknown key', card({ extra: true })],
    ['a lowercase team id', card({ teamId: 'tfake0001' })],
    ['a numeric ts', card({ ts: 1700000000.0001 })],
    [
      'a permalink for another message',
      card({ permalink: 'https://acme.slack.com/archives/CFAKE0003/p1' })
    ]
  ])('shows the raw block for %s', (_label, source) => {
    renderSlackFence('slack-message', source, null)
    expect(document.querySelector('[data-native-chat-slack-card]')).toBeNull()
    expect(document.querySelector('[data-code-language="slack-message"]')).not.toBeNull()
    expect(document.querySelector('pre')).toHaveTextContent(source)
  })

  it('shows the raw block outside an assistant reply and while the fence streams', () => {
    const { unmount } = renderSlackFence('slack-message', card(), null, {
      ...REPLY_SCOPE,
      markupPreviews: false
    })
    expect(document.querySelector('[data-native-chat-slack-card]')).toBeNull()
    unmount()
    const source = card()
    renderSlackFence('slack-message', `${source}\n`, null, {
      ...REPLY_SCOPE,
      openFenceBody: source
    })
    expect(document.querySelector('[data-native-chat-slack-card]')).toBeNull()
  })
})
