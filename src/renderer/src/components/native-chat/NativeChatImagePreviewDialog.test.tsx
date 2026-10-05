// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import { useState } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NativeChatImagePreviewDialog } from './NativeChatImagePreviewDialog'
import { PIXEL_PNG } from './native-chat-slack-card-test-fixtures'

const VIEWPORT = { width: 1000, height: 800 }
const TALL = { width: 1481, height: 4000 }

function Harness({ onClose }: { onClose: () => void }): React.JSX.Element {
  const [open, setOpen] = useState(true)
  return (
    <NativeChatImagePreviewDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          onClose()
        }
      }}
      label="Board"
      src={PIXEL_PNG}
    />
  )
}

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

/** Opens the viewer on a 1000×800 viewport with a 1481×4000 image loaded. */
async function openViewer() {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement
  ) {
    return this.hasAttribute('data-image-viewer-surface')
      ? rect(VIEWPORT.width, VIEWPORT.height)
      : rect(0, 0)
  })
  const onClose = vi.fn()
  render(<Harness onClose={onClose} />)
  const dialog = await screen.findByRole('dialog')
  const surface = dialog.querySelector<HTMLElement>('[data-image-viewer-surface]')
  const image = dialog.querySelector<HTMLImageElement>('[data-image-viewer-image]')
  if (!surface || !image) {
    throw new Error('viewer did not render')
  }
  Object.defineProperty(image, 'naturalWidth', { value: TALL.width })
  Object.defineProperty(image, 'naturalHeight', { value: TALL.height })
  fireEvent.load(image)
  const zoom = dialog.querySelector('[data-image-viewer-zoom]')
  await vi.waitFor(() => expect(zoom).toHaveTextContent('20%'))
  return { dialog, surface, image, zoom, onClose }
}

function transform(image: HTMLImageElement): { x: number; y: number; scale: number } {
  const match = /translate\(([-\d.e]+)px, ([-\d.e]+)px\) scale\(([-\d.e]+)\)/.exec(
    image.style.transform
  )
  if (!match) {
    throw new Error(`no transform: ${image.style.transform}`)
  }
  return { x: Number(match[1]), y: Number(match[2]), scale: Number(match[3]) }
}

/** happy-dom's WheelEvent drops the modifier and pointer fields, so they are set here. */
function wheel(init: { deltaY: number; ctrlKey?: boolean; clientX?: number; clientY?: number }) {
  const event = new WheelEvent('wheel', { deltaY: init.deltaY, bubbles: true, cancelable: true })
  for (const key of ['ctrlKey', 'clientX', 'clientY'] as const) {
    Object.defineProperty(event, key, { value: init[key] ?? (key === 'ctrlKey' ? false : 0) })
  }
  return event
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('NativeChatImagePreviewDialog', () => {
  it('starts at fit, with the whole tall image on screen', async () => {
    const { image, surface } = await openViewer()
    expect(transform(image).scale).toBeCloseTo(0.2)
    expect(image.style.width).toBe('1481px')
    expect(document.activeElement).toBe(surface)
  })

  it('zooms around the pointer on a ctrl-wheel (trackpad pinch), and pans on a plain wheel', async () => {
    const { image, surface, zoom } = await openViewer()
    act(() => {
      surface.dispatchEvent(wheel({ deltaY: -200, ctrlKey: true, clientX: 500, clientY: 100 }))
    })
    const zoomed = transform(image)
    expect(zoomed.scale).toBeCloseTo(0.2 * Math.exp(200 / 300))
    expect(zoom).toHaveTextContent('39%')
    // The image point under the pointer stays put.
    const before = { x: (500 - (1000 - 1481 * 0.2) / 2) / 0.2, y: 100 / 0.2 }
    expect((500 - zoomed.x) / zoomed.scale).toBeCloseTo(before.x)
    expect((100 - zoomed.y) / zoomed.scale).toBeCloseTo(before.y)

    const scroll = wheel({ deltaY: 120 })
    act(() => {
      surface.dispatchEvent(scroll)
    })
    expect(scroll.defaultPrevented).toBe(true)
    expect(transform(image).y).toBeCloseTo(zoomed.y - 120)
  })

  it('zooms with + and −, returns to fit with 0, and fits the width', async () => {
    const { surface, zoom } = await openViewer()
    fireEvent.keyDown(surface, { key: '+' })
    expect(zoom).toHaveTextContent('25%')
    fireEvent.keyDown(surface, { key: '-' })
    fireEvent.keyDown(surface, { key: '-' })
    expect(zoom).toHaveTextContent('20%')
    fireEvent.keyDown(surface, { key: '=' })
    fireEvent.keyDown(surface, { key: '0' })
    expect(zoom).toHaveTextContent('20%')
    fireEvent.click(screen.getByRole('button', { name: 'Fit width' }))
    expect(zoom).toHaveTextContent('68%')
  })

  it('drags to pan once zoomed, and double-click toggles 100%', async () => {
    const { image, surface, onClose } = await openViewer()
    fireEvent.doubleClick(surface, { clientX: 500, clientY: 400 })
    expect(transform(image).scale).toBe(1)
    const start = transform(image)
    fireEvent.pointerDown(surface, { pointerId: 1, button: 0, clientX: 500, clientY: 400 })
    fireEvent.pointerMove(surface, { pointerId: 1, clientX: 450, clientY: 300 })
    fireEvent.pointerUp(surface, { pointerId: 1, clientX: 450, clientY: 300 })
    expect(transform(image).x).toBeCloseTo(start.x - 50)
    expect(transform(image).y).toBeCloseTo(start.y - 100)
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.doubleClick(surface, { clientX: 500, clientY: 400 })
    expect(transform(image).scale).toBeCloseTo(0.2)
  })

  it('closes on a click beside the image, but not on the image', async () => {
    const { surface, onClose } = await openViewer()
    fireEvent.pointerDown(surface, { pointerId: 1, button: 0, clientX: 500, clientY: 400 })
    fireEvent.pointerUp(surface, { pointerId: 1, clientX: 500, clientY: 400 })
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.pointerDown(surface, { pointerId: 2, button: 0, clientX: 20, clientY: 400 })
    fireEvent.pointerUp(surface, { pointerId: 2, clientX: 20, clientY: 400 })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('closes with Esc and with the X button', async () => {
    const first = await openViewer()
    fireEvent.keyDown(first.surface, { key: 'Escape' })
    expect(first.onClose).toHaveBeenCalledTimes(1)
    cleanup()
    vi.restoreAllMocks()
    const second = await openViewer()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(second.onClose).toHaveBeenCalledTimes(1)
  })
})
