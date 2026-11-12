import { act, fireEvent, screen } from '@testing-library/react'
import { render } from '../../messages/actions/native-chat-tooltip-test-harness'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  BELOW_TRANSCRIPT_PX,
  deliverResizes,
  layout,
  list,
  marker,
  ROW_PITCH_PX,
  ROW_PX,
  scrollTranscript,
  stubLayout,
  stubResizeObserver,
  TRANSCRIPT_LENGTH
} from './native-chat-windowing-test-harness'

function scrollRoot(container: HTMLElement): HTMLElement {
  const scroller = container.querySelector<HTMLElement>('[data-native-chat-scroll]')
  if (!scroller) {
    throw new Error('no transcript scroll root')
  }
  return scroller
}

/** Deliver resize and scroll events to a fixed point, as a painted frame would. */
function paint(container: HTMLElement): void {
  const scroller = scrollRoot(container)
  let lastScrollTop = scroller.scrollTop
  for (let pass = 0; pass < 12; pass += 1) {
    let changed = false
    act(() => {
      changed = deliverResizes()
    })
    if (scroller.scrollTop !== lastScrollTop) {
      lastScrollTop = scroller.scrollTop
      fireEvent.scroll(scroller)
      changed = true
    }
    if (!changed) {
      return
    }
  }
  throw new Error('the transcript never settled: resize and scroll kept moving it')
}

describe('measured rows above the reader', () => {
  const transcript = Array.from({ length: TRANSCRIPT_LENGTH }, (_, index) => marker(index))

  let restoreLayout = (): void => {}
  let restoreResizeObserver = (): void => {}
  beforeEach(() => {
    restoreLayout = stubLayout({ scrollGeometry: true, offsetChain: true })
    restoreResizeObserver = stubResizeObserver()
    layout.belowTranscriptPx = BELOW_TRANSCRIPT_PX
    layout.aboveTranscriptPx = 0
  })
  afterEach(() => {
    restoreResizeObserver()
    restoreLayout()
    layout.measuredRowHeights = []
    layout.belowTranscriptPx = BELOW_TRANSCRIPT_PX
    layout.aboveTranscriptPx = 0
    vi.restoreAllMocks()
  })

  // A row above that settles late while the reader scrolls up (a widget reporting
  // its height) must not shift the view toward the end.
  it('compensates a measured row above that settles while scrolling up', () => {
    const readingAt = 2000
    const aboveIndex = Math.floor(readingAt / ROW_PITCH_PX) - 1
    const { container } = render(list(transcript))
    paint(container)
    scrollTranscript(container, readingAt + 100)
    paint(container)
    layout.measuredRowHeights = Array.from({ length: TRANSCRIPT_LENGTH }, (_, index) =>
      index === aboveIndex ? ROW_PX + 10 : ROW_PX
    )
    paint(container)
    scrollTranscript(container, readingAt)
    paint(container)
    const scroller = scrollRoot(container)

    for (const delta of [20, -30]) {
      const before = scroller.scrollTop
      layout.measuredRowHeights = layout.measuredRowHeights.map((height, index) =>
        index === aboveIndex ? height + delta : height
      )
      paint(container)
      expect(scroller.scrollTop).toBe(before + delta)
    }
    expect(screen.getByRole('button', { name: /jump to latest/i })).toBeInTheDocument()
  })
})
