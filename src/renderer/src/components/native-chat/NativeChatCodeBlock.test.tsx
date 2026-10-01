// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NativeChatCodeBlock } from './NativeChatCodeBlock'
import {
  NativeChatFencePreviewContext,
  type NativeChatFencePreviewScope
} from './native-chat-fence-preview'
import {
  NATIVE_CHAT_MARKUP_PREVIEW_CSP,
  NATIVE_CHAT_MARKUP_SIZE_MESSAGE
} from './native-chat-markup-preview-document'
import { NATIVE_CHAT_MARKUP_MAX_HEIGHT_PX } from './NativeChatMarkupPreview'

// Mermaid itself is the editor's renderer; this suite only checks it is routed there.
vi.mock('@/components/editor/MermaidBlock', () => ({
  default: ({ content }: { content: string }) => <div data-testid="mermaid-block">{content}</div>
}))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const REPLY: NativeChatFencePreviewScope = { markupPreviews: true, openFenceBody: null }

function renderFence(
  language: string,
  code: string,
  scope: NativeChatFencePreviewScope | null = REPLY
) {
  const block = (
    <NativeChatCodeBlock language={language}>
      <code className={`language-${language}`}>{code}</code>
    </NativeChatCodeBlock>
  )
  return render(
    scope ? (
      <NativeChatFencePreviewContext.Provider value={scope}>
        {block}
      </NativeChatFencePreviewContext.Provider>
    ) : (
      block
    )
  )
}

describe('NativeChatCodeBlock', () => {
  it('copies only the fenced code and confirms success', async () => {
    const writeClipboardText = vi.fn().mockResolvedValue(undefined)
    Object.assign(window, { api: { ui: { writeClipboardText } } })

    render(
      <NativeChatCodeBlock language="typescript">
        <code>{'const answer = 42\nconsole.log(answer)\n'}</code>
      </NativeChatCodeBlock>
    )

    expect(screen.getByText('TypeScript')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Copy code' }))

    await waitFor(() => {
      expect(writeClipboardText).toHaveBeenCalledWith('const answer = 42\nconsole.log(answer)\n')
    })
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument()
  })
})

describe('NativeChatCodeBlock diagrams', () => {
  it('draws a finished mermaid fence through the shared renderer, with its source a toggle away', () => {
    renderFence('mermaid', 'graph TD\n  A-->B\n')
    const card = document.querySelector('[data-native-chat-diagram="mermaid"]')
    expect(card).not.toBeNull()
    expect(screen.getByTestId('mermaid-block')).toHaveTextContent('graph TD A-->B')

    const toggle = screen.getByRole('button', { name: 'Code' })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByTestId('mermaid-block')).toBeNull()
    expect(card?.querySelector('pre code')?.textContent).toBe('graph TD\n  A-->B\n')
    expect(screen.getByRole('button', { name: 'Copy code' })).toBeInTheDocument()
  })

  it('shows a mermaid fence that is still streaming as code', () => {
    renderFence('mermaid', 'graph TD\n  A-->', {
      markupPreviews: true,
      openFenceBody: 'graph TD\n  A-->'
    })
    expect(screen.queryByTestId('mermaid-block')).toBeNull()
    expect(document.querySelector('[data-native-chat-diagram]')).toBeNull()
    expect(document.querySelector('pre')?.textContent).toBe('graph TD\n  A-->')
  })

  it.each(['html', 'svg'] as const)(
    'previews a finished %s fence in a sandboxed, network-free frame',
    (language) => {
      const source = language === 'svg' ? '<svg><circle r="4"/></svg>' : '<p>Diagram</p>'
      renderFence(language, source)
      const frame = document.querySelector('iframe')
      expect(frame).not.toBeNull()
      expect(frame).toHaveAttribute('sandbox', 'allow-scripts')
      expect(frame?.getAttribute('sandbox')).not.toContain('allow-same-origin')
      expect(frame).toHaveAttribute('referrerpolicy', 'no-referrer')
      const srcDoc = frame?.getAttribute('srcdoc') ?? ''
      expect(srcDoc).toContain(
        `<meta http-equiv="Content-Security-Policy" content="${NATIVE_CHAT_MARKUP_PREVIEW_CSP}">`
      )
      expect(srcDoc).toContain("default-src 'none'")
      expect(frame).toHaveAccessibleName(language === 'svg' ? 'SVG preview' : 'HTML preview')
    }
  )

  it('keeps html as code outside a reply and while it streams', () => {
    renderFence('html', '<p>Diagram</p>', null)
    expect(document.querySelector('iframe')).toBeNull()
    cleanup()
    renderFence('html', '<p>Diag', { markupPreviews: true, openFenceBody: '<p>Diag' })
    expect(document.querySelector('iframe')).toBeNull()
    expect(screen.getByText('<p>Diag')).toBeInTheDocument()
  })

  it('fits the frame to the height its own window reports, within bounds', () => {
    renderFence('html', '<p>Sized</p>')
    const frame = document.querySelector('iframe')
    if (!frame?.contentWindow) {
      throw new Error('preview frame did not mount a window')
    }
    const post = (source: MessageEventSource | null, height: unknown): void => {
      act(() => {
        window.dispatchEvent(
          new MessageEvent('message', {
            source,
            data: { type: NATIVE_CHAT_MARKUP_SIZE_MESSAGE, height }
          })
        )
      })
    }
    post(frame.contentWindow, 212.4)
    expect(frame.style.height).toBe('213px')
    post(window, 400)
    expect(frame.style.height).toBe('213px')
    post(frame.contentWindow, 'tall')
    expect(frame.style.height).toBe('213px')
    post(frame.contentWindow, 99_999)
    expect(frame.style.height).toBe(`${NATIVE_CHAT_MARKUP_MAX_HEIGHT_PX}px`)
  })

  it('frames a finished widget fence with a quiet header, source disclosure and copy', async () => {
    const writeClipboardText = vi.fn().mockResolvedValue(undefined)
    Object.assign(window, { api: { ui: { writeClipboardText } } })
    const source = '<div class="card">Hi</div>\n'
    renderFence('widget', source)
    const card = document.querySelector('[data-native-chat-diagram="widget"]')
    expect(card).not.toBeNull()
    const frame = card?.querySelector('iframe')
    expect(frame).toHaveAttribute('sandbox', 'allow-scripts')
    expect(frame).toHaveAccessibleName('Widget preview')
    expect(frame?.getAttribute('srcdoc')).toContain("default-src 'none'")

    const toggle = screen.getByRole('button', { name: 'Widget' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(card?.querySelector('pre')).toBeNull()
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    const pre = card?.querySelector('pre')
    expect(pre?.textContent).toBe(source)
    expect(toggle).toHaveAttribute('aria-controls', pre?.id)
    // The source opens above the widget; the widget stays drawn.
    expect(card?.querySelector('iframe')).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Copy widget source' }))
    await waitFor(() => expect(writeClipboardText).toHaveBeenCalledWith(source))
  })

  it('keeps a widget fence as code outside a reply and while it streams', () => {
    renderFence('widget', '<div class="card">Hi</div>', null)
    expect(document.querySelector('iframe')).toBeNull()
    cleanup()
    renderFence('widget', '<div class="ca', {
      markupPreviews: true,
      openFenceBody: '<div class="ca'
    })
    expect(document.querySelector('iframe')).toBeNull()
    expect(document.querySelector('[data-native-chat-diagram]')).toBeNull()
  })
})
