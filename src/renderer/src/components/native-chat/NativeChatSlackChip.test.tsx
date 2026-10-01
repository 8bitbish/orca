// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CommentMarkdown from '@/components/sidebar/CommentMarkdown'
import { renderNativeChatLink } from './NativeChatProjectChip'

// Made-up ids only.
const openSlack = vi.fn(async () => true)

function renderReply(content: string) {
  return render(
    <CommentMarkdown content={content} variant="document" renderChatLink={renderNativeChatLink} />
  )
}

beforeEach(() => {
  vi.stubGlobal('api', { nativeChat: { openSlack, slackImage: vi.fn(async () => null) } })
})

afterEach(() => {
  cleanup()
  openSlack.mockClear()
  vi.unstubAllGlobals()
})

describe('NativeChatSlackChip', () => {
  it('draws a person as a name pill that opens them in Slack', () => {
    renderReply('Ask [Sam](slack-user:TFAKE0001/UFAKE0002?d=acme) first.')
    const chip = screen.getByRole('button', { name: /Sam/ })
    expect(chip).toHaveAttribute('data-native-chat-slack-chip', 'user')
    expect(chip.querySelector('svg')).toBeNull()
    fireEvent.click(chip)
    expect(openSlack).toHaveBeenCalledWith('slack-user:TFAKE0001/UFAKE0002?d=acme')
  })

  it('draws a channel as its #name', () => {
    renderReply('Posted in [#design](slack-channel:TFAKE0001/CFAKE0003).')
    const chip = screen.getByRole('button', { name: /#design/ })
    expect(chip).toHaveAttribute('data-native-chat-slack-chip', 'channel')
    fireEvent.click(chip)
    expect(openSlack).toHaveBeenCalledWith('slack-channel:TFAKE0001/CFAKE0003')
  })

  it('draws a message as a link pill with an arrow, thread replies included', () => {
    renderReply(
      'See [Sam · sidebar ↗](slack-message:TFAKE0001/CFAKE0003/1700000000.000200/1700000000.000100?d=acme).'
    )
    const chip = screen.getByRole('button', { name: /Sam · sidebar/ })
    expect(chip).toHaveAttribute('data-native-chat-slack-chip', 'message')
    expect(chip.querySelector('svg')).not.toBeNull()
    // The link text's own ↗ gives way to the drawn arrow, so there is only one.
    expect(chip.textContent).not.toContain('↗')
    fireEvent.click(chip)
    expect(openSlack).toHaveBeenCalledWith(
      'slack-message:TFAKE0001/CFAKE0003/1700000000.000200/1700000000.000100?d=acme'
    )
  })

  it('keeps the chip one prose line high with even padding, like project chips', () => {
    renderReply('Ask [Sam](slack-user:TFAKE0001/UFAKE0002).')
    const chip = screen.getByRole('button', { name: /Sam/ })
    expect(chip).toHaveClass('h-5', 'leading-4', 'align-top', 'px-1.5', 'rounded-full')
  })

  it.each([
    ['a lowercase id', '[Sam](slack-user:tfake0001/ufake0002)'],
    ['an extra segment', '[Sam](slack-user:TFAKE0001/UFAKE0002/X)'],
    ['an unknown query key', '[#design](slack-channel:TFAKE0001/CFAKE0003?x=1)'],
    ['a numeric-looking bad ts', '[msg](slack-message:TFAKE0001/CFAKE0003/17000.1)'],
    ['a user id in a channel slot', '[#design](slack-channel:TFAKE0001/UFAKE0002)']
  ])('reads a chip with %s as plain text', (_label, markdown) => {
    renderReply(`See ${markdown}.`)
    expect(screen.queryByRole('button')).toBeNull()
    expect(document.querySelector('[data-native-chat-slack-chip="plain"]')).not.toBeNull()
    expect(document.querySelector('a')).toBeNull()
  })
})
