// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NativeChatCodeBlock } from './NativeChatCodeBlock'
import { NativeChatFencePreviewContext } from './native-chat-fence-preview'
import {
  NativeChatProjectReplyContext,
  type NativeChatProjectReplyChannel
} from './native-chat-project-reply-context'
import { chatMessage, PIXEL_PNG, REPLY_SCOPE } from './native-chat-slack-card-test-fixtures'

// Made-up project and paths only.
const BUNDLE = '/Users/someone/.orca-personal/proof/demo/2026-10-04-switch'

const CARD = {
  worktree: 'demo/switch-tiles',
  title: 'Replace: tap another tile to switch',
  kind: 'web',
  summary: 'Tapping another tile switches Replace to it.',
  media: [
    {
      type: 'video',
      path: `${BUNDLE}/flow.mp4`,
      caption: 'Switching tiles',
      where: 'Chromium'
    },
    {
      type: 'image',
      path: `${BUNDLE}/before.png`,
      role: 'before',
      caption: 'Old'
    },
    {
      type: 'image',
      path: `${BUNDLE}/after.png`,
      role: 'after',
      caption: 'New'
    },
    { type: 'image', path: `${BUNDLE}/extra.png`, caption: 'Menu open' }
  ],
  checks: [
    { label: 'Tests', result: '73/73 pass' },
    { label: 'Lint', result: '2 failed' },
    { label: 'On iPhone', result: 'not checked' }
  ],
  links: [{ label: 'PR #72', url: 'https://example.com/pr/72' }],
  actions: [
    { label: 'Looks right', reply: 'Looks right, ship it', style: 'primary' },
    { label: 'Needs changes…', input: true }
  ]
}

function source(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({ ...CARD, ...overrides })
}

function element(selector: string): HTMLElement {
  const found = document.querySelector<HTMLElement>(selector)
  if (!found) {
    throw new Error(`No element for ${selector}`)
  }
  return found
}

function renderProofFence(code: string, channel: NativeChatProjectReplyChannel | null = null) {
  return render(
    <NativeChatFencePreviewContext.Provider value={REPLY_SCOPE}>
      <NativeChatProjectReplyContext.Provider value={channel}>
        <NativeChatCodeBlock language="proof-card">
          <code>{code}</code>
        </NativeChatCodeBlock>
      </NativeChatProjectReplyContext.Provider>
    </NativeChatFencePreviewContext.Provider>
  )
}

let api: {
  proofImage: ReturnType<typeof vi.fn>
  proofVideo: ReturnType<typeof vi.fn>
}
let openUrl: ReturnType<typeof vi.fn>

beforeEach(() => {
  api = {
    proofImage: vi.fn(async ({ path }: { path: string }) =>
      path.includes('missing')
        ? { ok: false, reason: 'missing' }
        : {
            ok: true,
            image: {
              src: PIXEL_PNG,
              mimeType: 'image/png',
              width: 4,
              height: 3,
              byteLength: 68
            }
          }
    ),
    proofVideo: vi.fn(async ({ path }: { path: string }) =>
      path.includes('missing')
        ? { ok: false, reason: 'missing' }
        : {
            ok: true,
            mimeType: 'video/mp4',
            bytes: new Uint8Array([0, 0, 0, 0x20])
          }
    )
  }
  openUrl = vi.fn(async () => undefined)
  vi.stubGlobal('api', { nativeChat: api, shell: { openUrl } })
  vi.stubGlobal('IntersectionObserver', undefined)
})

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.unstubAllGlobals()
})

describe('NativeChatProofCard', () => {
  it('draws the header, a looping muted video, a before/after slider, the strip and checks', async () => {
    renderProofFence(source())
    const card = document.querySelector('[data-native-chat-proof-card]')
    expect(card).not.toBeNull()
    expect(card).toHaveAttribute('data-proof-kind', 'web')
    // An unknown workspace reads as its plain name.
    expect(screen.getByText('demo/switch-tiles')).toBeInTheDocument()
    expect(document.querySelector('[data-proof-kind="web"] ')).toHaveTextContent('Web')
    expect(document.querySelector('[data-proof-title]')).toHaveTextContent(CARD.title)
    expect(document.querySelector('[data-proof-summary]')).toHaveTextContent(CARD.summary)

    const video = await waitFor(() => {
      const element = document.querySelector<HTMLVideoElement>('[data-proof-video]')
      expect(element).not.toBeNull()
      return element!
    })
    expect(video.muted).toBe(true)
    expect(video.loop).toBe(true)
    expect(video.getAttribute('src')).toMatch(/^blob:/)
    expect(api.proofVideo).toHaveBeenCalledWith({
      path: 'demo/2026-10-04-switch/flow.mp4'
    })
    expect(screen.getByText('Switching tiles · Chromium')).toBeInTheDocument()

    const slider = await screen.findByRole('slider', {
      name: 'Drag to compare before and after'
    })
    const before = document.querySelector<HTMLElement>('[data-proof-compare-before]')
    expect(before?.style.clipPath).toBe('inset(0 50% 0 0)')
    fireEvent.change(slider, { target: { value: '80' } })
    expect(before?.style.clipPath).toBe('inset(0 20% 0 0)')
    expect(screen.getByText('Before · Old')).toBeInTheDocument()
    expect(screen.getByText('After · New')).toBeInTheDocument()

    // The pair is in the slider, so the strip only holds the other screenshot.
    const strip = document.querySelector('[data-proof-strip]')
    await waitFor(() => expect(within(strip as HTMLElement).getAllByRole('button')).toHaveLength(1))
    expect(within(strip as HTMLElement).getByRole('button')).toHaveAccessibleName(
      'View image: Menu open'
    )

    const checks = [...document.querySelectorAll('[data-proof-check]')].map((row) =>
      row.getAttribute('data-proof-check')
    )
    expect(checks).toEqual(['pass', 'fail', 'unchecked'])
  })

  it('opens a screenshot full size, and the video full screen (as a dialog without the API)', async () => {
    renderProofFence(source())
    fireEvent.click(await screen.findByRole('button', { name: 'View image: Menu open' }))
    const imageDialog = await screen.findByRole('dialog')
    expect(within(imageDialog).getByRole('img', { name: 'Menu open' })).toHaveAttribute(
      'src',
      PIXEL_PNG
    )
    expect(api.proofImage).toHaveBeenCalledWith({
      path: 'demo/2026-10-04-switch/extra.png',
      variant: 'full'
    })
    cleanup()
    renderProofFence(source())
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Play Switching tiles full screen'
      })
    )
    const videoDialog = await screen.findByRole('dialog')
    expect(videoDialog.querySelector('video[controls]')).not.toBeNull()
  })

  it('shows placeholders for missing media', async () => {
    renderProofFence(
      source({
        media: [
          { type: 'video', path: `${BUNDLE}/missing.mp4` },
          { type: 'image', path: `${BUNDLE}/missing.png` }
        ]
      })
    )
    await waitFor(() =>
      expect(document.querySelectorAll('[data-proof-media-missing]')).toHaveLength(2)
    )
    expect(screen.getByText('Recording not found')).toBeInTheDocument()
    expect(screen.getByText('Screenshot not found')).toBeInTheDocument()
  })

  it('cuts a long check result to fit, with the full text on hover and on Show more', () => {
    const long = `${'Every token matches the dark theme in the board, '.repeat(4)}checked twice.`
    renderProofFence(source({ checks: [{ label: 'Tokens', result: long }] }))
    expect(document.querySelector('[data-native-chat-proof-card]')).not.toBeNull()
    const result = element('[data-proof-check-result]')
    const cut = result.textContent ?? ''
    expect(cut.length).toBeLessThanOrEqual(160)
    expect(cut.endsWith('…')).toBe(true)
    expect(result).toHaveAttribute('title', long)
    const toggle = screen.getByRole('button', { name: 'Show more' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(toggle)
    expect(result).toHaveTextContent(long)
    expect(result).not.toHaveAttribute('title')
    fireEvent.click(screen.getByRole('button', { name: 'Show less' }))
    expect(result).toHaveTextContent(cut)
  })

  it('cuts a long title and summary, keeping the full text', () => {
    const title = 'A very long title '.repeat(14)
    const summary = 'A summary sentence that goes on. '.repeat(40)
    renderProofFence(source({ title, summary }))
    const shownTitle = element('[data-proof-title]')
    expect(shownTitle.textContent?.endsWith('…')).toBe(true)
    expect(shownTitle).toHaveAttribute('title', title.trim())
    const shownSummary = element('[data-proof-summary]')
    fireEvent.click(within(shownSummary).getByRole('button', { name: 'Show more' }))
    expect(shownSummary).toHaveTextContent(summary.trim())
  })

  it('says how many media, checks and links it left out', () => {
    renderProofFence(
      source({
        media: Array.from({ length: 14 }, (_, i) => ({
          type: 'image',
          path: `${BUNDLE}/shot-${i}.png`
        })),
        checks: Array.from({ length: 13 }, (_, i) => ({
          label: `Check ${i}`,
          result: 'ok'
        })),
        links: [
          ...Array.from({ length: 8 }, (_, i) => ({
            label: `Link ${i}`,
            url: `https://example.com/${i}`
          })),
          { label: 'Bad', url: 'javascript:alert(1)' },
          { label: 'Extra', url: 'https://example.com/extra' }
        ]
      })
    )
    expect(document.querySelectorAll('[data-proof-check]')).toHaveLength(12)
    expect(document.querySelectorAll('[data-proof-link]')).toHaveLength(8)
    expect(document.querySelector('[data-proof-more="media"]')).toHaveTextContent(
      '+2 more2 more media not shown'
    )
    expect(document.querySelector('[data-proof-more="checks"]')).toHaveAttribute(
      'title',
      '1 more checks not shown'
    )
    expect(document.querySelector('[data-proof-more="links"]')).toHaveTextContent('+2 more')
    expect(document.querySelector('[data-proof-more="actions"]')).toBeNull()
  })

  it('falls back to two tiles when one half of the pair cannot be shown', async () => {
    renderProofFence(
      source({
        media: [
          { type: 'image', path: `${BUNDLE}/missing.png`, role: 'before' },
          { type: 'image', path: `${BUNDLE}/after.png`, role: 'after' }
        ]
      })
    )
    await waitFor(() => expect(document.querySelector('[data-proof-media-missing]')).not.toBeNull())
    expect(screen.queryByRole('slider')).toBeNull()
    expect(await screen.findByRole('button', { name: 'View image: after.png' })).toBeInTheDocument()
  })

  it('opens links externally and sends actions as the next message', () => {
    const send = vi.fn(() => true)
    renderProofFence(source(), { send, canSend: true, messages: [] })
    fireEvent.click(screen.getByRole('button', { name: 'PR #72' }))
    expect(openUrl).toHaveBeenCalledWith('https://example.com/pr/72')
    fireEvent.click(screen.getByRole('button', { name: /^Looks right/ }))
    expect(send).toHaveBeenCalledWith('Looks right, ship it')
    cleanup()
    renderProofFence(source(), {
      send,
      canSend: true,
      messages: [
        chatMessage('a1', 'assistant', 'card'),
        chatMessage('u1', 'user', 'Looks right, ship it')
      ]
    })
    expect(document.querySelector('[data-project-action-chosen="true"]')).toHaveTextContent(
      'Looks right'
    )
  })

  it('opens a reply box for an input action', () => {
    const send = vi.fn(() => true)
    renderProofFence(source(), { send, canSend: true, messages: [] })
    fireEvent.click(screen.getByRole('button', { name: /^Needs changes/ }))
    const box = screen.getByRole('textbox', { name: 'Needs changes…' })
    fireEvent.change(box, { target: { value: 'Make the handle bigger' } })
    fireEvent.submit(box.closest('form') as HTMLFormElement)
    expect(send).toHaveBeenCalledWith('Make the handle bigger')
  })

  it('shows invalid JSON and off-schema cards as the raw block', () => {
    renderProofFence('{"worktree": "demo",')
    expect(document.querySelector('[data-native-chat-proof-card]')).toBeNull()
    expect(document.querySelector('[data-code-language="proof-card"]')).not.toBeNull()
    cleanup()
    renderProofFence(source({ media: 'flow.mp4' }))
    expect(document.querySelector('[data-native-chat-proof-card]')).toBeNull()
  })

  it('shows the raw block for a media path outside the proof folder, without asking the host', () => {
    renderProofFence(
      source({
        media: [{ type: 'image', path: '/Users/someone/Desktop/secret.png' }]
      })
    )
    expect(document.querySelector('[data-native-chat-proof-card]')).toBeNull()
    expect(api.proofImage).not.toHaveBeenCalled()
  })
})
