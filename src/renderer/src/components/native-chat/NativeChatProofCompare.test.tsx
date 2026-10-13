// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NativeChatProofMedia } from '../../../../shared/native-chat-proof-card-payload'
import { NativeChatProofViewer } from './NativeChatProofMedia'
import { PIXEL_PNG } from './native-chat-slack-card-test-fixtures'

// Made-up paths; each file name carries the size the fake host reports for it.
const FULL_JPEG = 'data:image/jpeg;base64,/9j/4AAQ'

const SIZES: Record<string, [number, number]> = {
  'tall.png': [1481, 4000],
  'board.png': [1534, 3600],
  'phone.png': [1170, 2532],
  'wide.png': [1920, 1080],
  'banner.png': [4000, 200]
}

function image(name: string, role?: 'before' | 'after'): NativeChatProofMedia {
  return {
    type: 'image',
    path: `demo/bundle/${name}`,
    source: `/Users/someone/.orca-personal/proof/demo/bundle/${name}`,
    caption: name,
    ...(role ? { role } : {})
  }
}

let proofImage: ReturnType<typeof vi.fn>

beforeEach(() => {
  proofImage = vi.fn(async ({ path, variant }: { path: string; variant: string }) => {
    const [width, height] = SIZES[path.split('/').pop() ?? ''] ?? [4, 3]
    return {
      ok: true,
      image: {
        src: variant === 'full' ? FULL_JPEG : PIXEL_PNG,
        mimeType: variant === 'full' ? 'image/jpeg' : 'image/png',
        width,
        height,
        byteLength: 68
      }
    }
  })
  vi.stubGlobal('api', { nativeChat: { proofImage, proofVideo: vi.fn() } })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function rect(width: number, height: number): DOMRect {
  return {
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: width,
    bottom: height,
    width,
    height,
    toJSON: () => ({})
  }
}

describe('proof card thumbnails', () => {
  it('keep one fixed height whatever the image’s shape', async () => {
    render(
      <NativeChatProofViewer
        media={['tall.png', 'board.png', 'phone.png', 'wide.png', 'banner.png'].map((name) =>
          image(name)
        )}
      />
    )
    await waitFor(() => expect(document.querySelectorAll('[data-proof-image]')).toHaveLength(5))
    const tiles = [...document.querySelectorAll<HTMLElement>('[data-proof-image]')]
    expect(tiles.map((tile) => tile.style.height)).toEqual(Array(5).fill('176px'))
    expect(tiles.map((tile) => tile.style.width)).toEqual([
      '320px',
      '320px',
      '128px',
      '313px',
      '320px'
    ])
    // Tall boards crop to their top with a cue; the rest show whole.
    expect(tiles.map((tile) => tile.getAttribute('data-fit'))).toEqual([
      'top',
      'top',
      'contain',
      'contain',
      'contain'
    ])
    expect(tiles.map((tile) => tile.querySelector('[data-proof-tall-cue]') !== null)).toEqual([
      true,
      true,
      false,
      false,
      false
    ])
    // The card asks for thumbnails only; the full file waits for the viewer.
    expect(proofImage.mock.calls.every(([args]) => args.variant === 'thumbnail')).toBe(true)
  })

  it('stay as wide as their image, with a long caption wrapped to two lines', async () => {
    const caption = 'A very long caption that would otherwise stretch the tile far past its image'
    render(<NativeChatProofViewer media={[{ ...image('phone.png'), caption }]} />)
    const tile = await screen.findByRole('button', { name: `View image: ${caption}` })
    const figure = tile.closest<HTMLElement>('[data-proof-media="image"]')!
    expect(figure.style.width).toBe('128px')
    const shown = figure.querySelector<HTMLElement>('[data-proof-caption]')!
    expect(shown).toHaveAttribute('data-wrap')
    expect(shown.className).toContain('data-[wrap]:line-clamp-2')
    expect(shown).toHaveAttribute('title', caption)
  })

  it('open the full image in the zoom viewer', async () => {
    render(<NativeChatProofViewer media={[image('tall.png')]} />)
    fireEvent.click(await screen.findByRole('button', { name: 'View image: tall.png' }))
    const dialog = await screen.findByRole('dialog')
    await waitFor(() =>
      expect(within(dialog).getByRole('img', { name: 'tall.png' })).toHaveAttribute(
        'src',
        FULL_JPEG
      )
    )
    expect(within(dialog).getByRole('button', { name: 'Zoom in' })).toBeInTheDocument()
  })
})

describe('proof card before/after slider', () => {
  async function renderPair(before = 'tall.png', after = 'board.png') {
    render(<NativeChatProofViewer media={[image(before, 'before'), image(after, 'after')]} />)
    const frame = await waitFor(() => {
      const element = document.querySelector<HTMLElement>('[data-proof-compare]')
      if (!element) {
        throw new Error('no slider yet')
      }
      return element
    })
    vi.spyOn(frame, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 400,
      bottom: 320,
      width: 400,
      height: 320,
      toJSON: () => ({})
    })
    return frame
  }

  function viewerImage(dialog: HTMLElement): HTMLElement {
    const element = dialog.querySelector<HTMLElement>('[data-image-viewer-image]')
    if (!element) {
      throw new Error('no viewer image')
    }
    return element
  }

  function clipOf(): string | undefined {
    return document.querySelector<HTMLElement>('[data-proof-compare-before]')?.style.clipPath
  }

  it('sits in a fixed frame and crops a tall pair to the top', async () => {
    const frame = await renderPair()
    expect(frame.style.height).toBe('320px')
    expect(frame.style.width).toBe('720px')
    expect(frame).toHaveAttribute('data-fit', 'top')
    expect(frame.querySelector('[data-proof-tall-cue]')).not.toBeNull()
    cleanup()
    const wide = await renderPair('wide.png', 'wide.png')
    expect(wide.style.height).toBe('320px')
    expect(wide).toHaveAttribute('data-fit', 'contain')
  })

  it('moves the divider on a drag without opening anything', async () => {
    const frame = await renderPair()
    fireEvent.pointerDown(frame, { pointerId: 1, button: 0, clientX: 200, clientY: 100 })
    fireEvent.pointerMove(frame, { pointerId: 1, clientX: 260, clientY: 102 })
    fireEvent.pointerMove(frame, { pointerId: 1, clientX: 300, clientY: 104 })
    fireEvent.pointerUp(frame, { pointerId: 1, clientX: 300, clientY: 104 })
    expect(clipOf()).toBe('inset(0 25% 0 0)')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('opens the pair full screen on a slider, with Before and After on their own', async () => {
    const frame = await renderPair()
    fireEvent.pointerDown(frame, { pointerId: 1, button: 0, clientX: 80, clientY: 100 })
    fireEvent.pointerUp(frame, { pointerId: 1, clientX: 81, clientY: 100 })
    expect(clipOf()).toBe('inset(0 50% 0 0)')
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('button', { name: 'Compare' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    // The viewer's image is the after side; before sits over it, cut at the divider.
    expect(viewerImage(dialog)).toHaveAttribute('alt', expect.stringContaining('After: board.png'))
    const surface = dialog.querySelector<HTMLElement>('[data-image-viewer-surface]')!
    vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue(rect(1000, 800))
    const image = viewerImage(dialog)
    Object.defineProperty(image, 'naturalWidth', { value: 1534 })
    Object.defineProperty(image, 'naturalHeight', { value: 3600 })
    fireEvent.load(image)
    const clip = await waitFor(() => {
      const element = dialog.querySelector<HTMLElement>('[data-image-viewer-compare-clip]')
      if (!element) {
        throw new Error('no full-screen slider yet')
      }
      return element
    })
    expect(clip.style.clipPath).toBe('inset(0 50% 0 0)')
    expect(dialog.querySelector('[data-image-viewer-compare-before]')).toHaveAttribute(
      'src',
      FULL_JPEG
    )
    const divider = dialog.querySelector<HTMLElement>('[data-image-viewer-compare-divider]')!
    fireEvent.pointerDown(divider, { pointerId: 3, button: 0, clientX: 500, clientY: 400 })
    fireEvent.pointerMove(divider, { pointerId: 3, clientX: 800, clientY: 400 })
    fireEvent.pointerUp(divider, { pointerId: 3, clientX: 800, clientY: 400 })
    expect(clip.style.clipPath).toBe('inset(0 20% 0 0)')
    fireEvent.change(
      within(dialog).getByRole('slider', { name: 'Drag to compare before and after' }),
      { target: { value: '40' } }
    )
    expect(clip.style.clipPath).toBe('inset(0 60% 0 0)')

    fireEvent.click(within(dialog).getByRole('button', { name: 'Before' }))
    expect(viewerImage(dialog)).toHaveAttribute('alt', 'Before: tall.png')
    expect(dialog.querySelector('[data-image-viewer-compare-clip]')).toBeNull()
    fireEvent.click(within(dialog).getByRole('button', { name: 'After' }))
    expect(viewerImage(dialog)).toHaveAttribute('alt', 'After: board.png')
    fireEvent.keyDown(viewerImage(dialog), { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('gives every before/after pair its own slider', async () => {
    render(
      <NativeChatProofViewer
        media={[
          image('tall.png', 'before'),
          image('phone.png', 'before'),
          image('board.png', 'after'),
          image('banner.png'),
          image('wide.png', 'after')
        ]}
      />
    )
    await waitFor(() => expect(document.querySelectorAll('[data-proof-compare]')).toHaveLength(2))
    expect(document.querySelectorAll('[data-proof-image]')).toHaveLength(1)
  })

  it('keeps the keyboard slider and a full-screen button', async () => {
    await renderPair()
    fireEvent.change(screen.getByRole('slider', { name: 'Drag to compare before and after' }), {
      target: { value: '30' }
    })
    expect(clipOf()).toBe('inset(0 70% 0 0)')
    fireEvent.click(screen.getByRole('button', { name: 'View before and after full screen' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('button', { name: 'Compare' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  })
})
