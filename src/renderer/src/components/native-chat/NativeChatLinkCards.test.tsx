// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NativeChatCodeBlock } from './NativeChatCodeBlock'
import { NativeChatFencePreviewContext } from './native-chat-fence-preview'
import { PIXEL_PNG, REPLY_SCOPE } from './native-chat-slack-card-test-fixtures'

let linkPreview: ReturnType<typeof vi.fn>
let openUrl: ReturnType<typeof vi.fn>

beforeEach(() => {
  linkPreview = vi.fn(async ({ url }: { url: string }) =>
    url.includes('/rich')
      ? {
          url,
          title: 'Page title',
          description: 'Page description',
          site: 'Rich',
          image: PIXEL_PNG
        }
      : url.includes('/old-host')
        ? Promise.reject(new Error('method_not_found'))
        : { url }
  )
  openUrl = vi.fn(async () => {})
  vi.stubGlobal('api', { nativeChat: { linkPreview }, shell: { openUrl } })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function renderFence(body: string) {
  return render(
    <NativeChatFencePreviewContext.Provider value={REPLY_SCOPE}>
      <NativeChatCodeBlock language="link-cards">
        <code>{body}</code>
      </NativeChatCodeBlock>
    </NativeChatFencePreviewContext.Provider>
  )
}

describe('NativeChatLinkCards', () => {
  it('fills missing fields from the host, keeping the card’s own and opening on click', async () => {
    renderFence(
      JSON.stringify({
        layout: 'grid',
        items: [{ url: 'https://example.com/rich', title: 'My title' }]
      })
    )
    const card = await screen.findByText('Page description')
    expect(screen.getByText('My title')).toBeInTheDocument()
    expect(screen.queryByText('Page title')).toBeNull()
    expect(screen.getByText('Rich')).toBeInTheDocument()
    expect(document.querySelector('[data-link-card-thumbnail="image"] img')).toHaveAttribute(
      'src',
      PIXEL_PNG
    )
    fireEvent.click(card)
    expect(openUrl).toHaveBeenCalledWith('https://example.com/rich')
  })

  it('falls back to the host name and an icon tile when the page gives nothing', async () => {
    renderFence(
      JSON.stringify({
        items: [{ url: 'https://www.bare.example/old-host' }, { url: 'https://bare.example/x' }]
      })
    )
    expect(await screen.findByText('bare.example/old-host')).toBeInTheDocument()
    expect(screen.getByText('bare.example/x')).toBeInTheDocument()
    expect(screen.getAllByText('bare.example')).toHaveLength(2)
    expect(document.querySelectorAll('[data-link-card-thumbnail="icon"]')).toHaveLength(2)
  })

  it('shows the raw block for a fence off the schema', () => {
    renderFence('{"items":[{"url":"ftp://example.com"}]}')
    expect(document.querySelector('[data-native-chat-link-cards]')).toBeNull()
    expect(screen.getByText(/ftp:\/\/example.com/)).toBeInTheDocument()
    expect(linkPreview).not.toHaveBeenCalled()
  })
})
