// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { act, cleanup, fireEvent, screen } from '@testing-library/react'
import { render } from '../../messages/actions/native-chat-tooltip-test-harness'
import { useCallback, useMemo, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Why: these fixtures have neither inline visual owners nor sender navigation.
const unusedChatLeaves = vi.hoisted(() => ({
  inlineVisual: vi.fn(() => {
    throw new Error('Unexpected inline visual in transcript fixture')
  }),
  openSender: vi.fn(() => {
    throw new Error('Unexpected sender navigation in transcript fixture')
  })
}))
vi.mock('../../media/visuals/NativeChatInlineVisual', () => ({
  NativeChatInlineVisual: unusedChatLeaves.inlineVisual
}))
vi.mock('@/lib/open-agent-message-sender', () => ({
  openAgentMessageSender: unusedChatLeaves.openSender
}))
afterEach(() => {
  expect(unusedChatLeaves.inlineVisual).not.toHaveBeenCalled()
  expect(unusedChatLeaves.openSender).not.toHaveBeenCalled()
})
import type { NativeChatMessage } from '../../../../../../shared/native-chat/native-chat-types'
import { NativeChatMessageList } from '../../NativeChatMessageList'
import {
  transcriptRowOffset,
  transcriptWindowTop
} from '../virtualization/native-chat-window-test-layout'
import type { NativeChatRailOutlineEntry } from '../rail/native-chat-message-rail-items'
import type { NativeChatOlderPageResult } from '../history/native-chat-pagination'
import {
  estimateNativeChatRowHeight,
  nativeChatRowContentMetrics
} from '../virtualization/native-chat-row-height-estimate'
import {
  deliverResizes,
  layout,
  marker,
  overrideLayoutProperty,
  session,
  stubLayout,
  stubResizeObserver
} from '../virtualization/native-chat-windowing-test-harness'

afterEach(cleanup)

const TOTAL = 60
const PAGE = 20
/** The scroll root's top gutter, always present. */
const TOP_GUTTER_PX = 40
/** In-flow older-history chrome disappears with the last page. */
const OLDER_HISTORY_ROW_PX = 52

function message(index: number): NativeChatMessage {
  return index % 5 === 0
    ? {
        id: `message-${index}`,
        role: 'user',
        blocks: [{ type: 'text', text: `prompt-${index}` }],
        timestamp: index + 1,
        source: 'transcript'
      }
    : marker(index)
}

const HISTORY = Array.from({ length: TOTAL }, (_, index) => message(index))

/** Every row measures exactly as estimated, so nothing but the jump moves the view. */
const ROW_HEIGHT_BY_TEXT = new Map(
  HISTORY.map((entry) => [
    entry.blocks[0]?.type === 'text' ? entry.blocks[0].text : '',
    estimateNativeChatRowHeight(nativeChatRowContentMetrics(entry), {
      hasReceipt: false,
      hasStatus: false,
      hasTurnDiff: false
    })
  ])
)

/** Publish each page before settling its promise; the outline also includes unloaded prompts. */
function PagedTranscript({
  holdPage
}: {
  /** Awaited before a page lands, to keep it in flight. */
  holdPage?: () => Promise<void>
}): React.JSX.Element {
  const [loaded, setLoaded] = useState(PAGE)
  const loadEarlier = useCallback(async (): Promise<NativeChatOlderPageResult> => {
    await (holdPage?.() ?? Promise.resolve())
    setLoaded((current) => Math.min(TOTAL, current + PAGE))
    return 'applied'
  }, [holdPage])
  const messages = useMemo(() => HISTORY.slice(TOTAL - loaded), [loaded])
  const railOutline = useMemo<NativeChatRailOutlineEntry[]>(
    () =>
      HISTORY.slice(0, TOTAL - loaded)
        .filter((entry) => entry.role === 'user')
        .map((entry) => ({
          id: entry.id,
          text: entry.blocks[0]?.type === 'text' ? entry.blocks[0].text : '',
          hasImages: false
        })),
    [loaded]
  )
  return (
    <NativeChatMessageList
      session={{ ...session(messages), hasMore: loaded < TOTAL, loadEarlier }}
      railOutline={railOutline}
      isWorking={false}
      expandSignal={false}
    />
  )
}

function rowText(row: HTMLElement): string {
  return /(?:prompt|marker)-\d+/.exec(row.querySelector('p')?.textContent ?? '')?.[0] ?? ''
}

// A jump must detach end-follow and retain its landing as older history arrives.
describe('jumping from the rail while following the end', () => {
  let restore: (() => void)[] = []
  let lastEventScrollTop = 0

  beforeEach(() => {
    vi.useFakeTimers({
      toFake: [
        'Date',
        'performance',
        'setTimeout',
        'clearTimeout',
        'requestAnimationFrame',
        'cancelAnimationFrame'
      ]
    })
    const undoLayout = stubLayout({ scrollGeometry: true, offsetChain: true })
    const stubbedHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')
    restore = [
      undoLayout,
      stubResizeObserver(),
      overrideLayoutProperty('offsetHeight', {
        get(this: HTMLElement): number {
          const estimated =
            this.dataset.index === undefined ? undefined : ROW_HEIGHT_BY_TEXT.get(rowText(this))
          return estimated ?? stubbedHeight?.get?.call(this) ?? 0
        }
      }),
      // The rail stands down in a narrow pane.
      overrideLayoutProperty('clientWidth', { get: () => 800 }),
      // Rows sit at their `top` inside the spacer, which sits under the chrome.
      overrideLayoutProperty('offsetTop', {
        get(this: HTMLElement): number {
          if (this.hasAttribute('data-native-chat-window')) {
            return layout.aboveTranscriptPx
          }
          return this.dataset.index === undefined ? 0 : transcriptRowOffset(this)
        }
      }),
      overrideLayoutProperty('offsetParent', {
        get(this: HTMLElement): HTMLElement | null {
          if (this.dataset.index !== undefined) {
            return this.closest<HTMLElement>('[data-native-chat-window]')
          }
          return this.parentElement?.closest<HTMLElement>('[data-native-chat-scroll]') ?? null
        }
      })
    ]
    // The older-history row counts only while it sits in the column's flow.
    Object.defineProperty(layout, 'aboveTranscriptPx', {
      configurable: true,
      get: () =>
        transcriptWindowTop(
          document.querySelector('[data-native-chat-window]'),
          TOP_GUTTER_PX,
          OLDER_HISTORY_ROW_PX
        )
    })
    vi.spyOn(HTMLElement.prototype, 'scrollTo').mockImplementation(function scrollTo(
      this: HTMLElement,
      options?: ScrollToOptions | number
    ): void {
      if (typeof options === 'object' && options.top !== undefined) {
        this.scrollTop = options.top
      }
    })
    lastEventScrollTop = 0
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    Object.defineProperty(layout, 'aboveTranscriptPx', {
      configurable: true,
      writable: true,
      value: 0
    })
    for (const undo of restore.toReversed()) {
      undo()
    }
  })

  function scroller(): HTMLElement {
    const element = document.querySelector<HTMLElement>('[data-native-chat-scroll]')
    if (!element) {
      throw new Error('no transcript scroll root')
    }
    return element
  }

  /** Deliver layout changes and scroll events before the virtualizer's next frame. */
  async function frame(): Promise<void> {
    const element = scroller()
    act(() => {
      // The stubbed setter clamps, so re-writing the offset applies a shrink.
      const offset = element.scrollTop
      element.scrollTop = offset
      deliverResizes()
    })
    if (element.scrollTop !== lastEventScrollTop) {
      lastEventScrollTop = element.scrollTop
      fireEvent.scroll(element)
    }
    await act(async () => {
      vi.advanceTimersByTime(16)
    })
  }

  async function settle(frames: number): Promise<void> {
    for (let index = 0; index < frames; index += 1) {
      await frame()
    }
  }

  /** Holds the first older page in flight until released; later pages land at once. */
  function holdFirstPage(): {
    holdPage: () => Promise<void>
    release: () => void
    asked: () => number
  } {
    let release: (() => void) | null = null
    let asked = 0
    return {
      holdPage: () => {
        asked += 1
        return asked > 1
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              release = resolve
            })
      },
      release: () => act(() => release?.()),
      asked: () => asked
    }
  }

  async function pickUnloadedWhilePaging(prompt: string): Promise<void> {
    fireEvent.click(screen.getByRole('button', { name: prompt }))
    await frame()
  }

  it('leaves the reader where they are after a wheel over "Jump to latest" while the jump pages', async () => {
    const pages = holdFirstPage()
    render(<PagedTranscript holdPage={pages.holdPage} />)
    await settle(10)
    act(() => {
      scroller().scrollTop = 200
    })
    await settle(2)
    await pickUnloadedWhilePaging('prompt-5')
    expect(pages.asked()).toBe(1)

    const jump = screen.getByRole('button', { name: 'Jump to latest' })
    // Inside the scroller, the browser scrolls the transcript for a wheel over the button.
    expect(scroller().contains(jump)).toBe(true)
    fireEvent.wheel(jump, { deltaY: -40 })
    await frame()
    expect(screen.queryByRole('dialog')).toBeNull()
    pages.release()
    await settle(60)

    expect(pages.asked()).toBe(1)
    expect(screen.queryByText('prompt-5')).toBeNull()
  })
})
