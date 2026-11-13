// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { MessageRow } from './NativeChatMessageRow'
import {
  NativeChatThoughtTimingContext,
  type NativeChatThoughtTiming
} from '../../native-chat-thought-markers'

afterEach(cleanup)

describe('MessageRow sent image prompt markers', () => {
  it('draws and copies a user message without the [Image #N] its send wrote mid-sentence', async () => {
    const writeClipboardText = vi.fn().mockResolvedValue(undefined)
    Object.assign(window, { api: { ui: { writeClipboardText } } })

    render(
      <TooltipProvider>
        <MessageRow
          message={{
            id: 'message',
            role: 'user',
            timestamp: 0,
            source: 'transcript',
            blocks: [
              { type: 'text', text: 'Compare this [Image #1] with `[Image #1]`' },
              { type: 'image-ref', path: '/tmp/screenshot.png', alt: 'Screenshot' }
            ]
          }}
          expandSignal={false}
          onScrollMessageToTop={vi.fn()}
        />
      </TooltipProvider>
    )
    expect(screen.getByText('[Image #1]').tagName).toBe('CODE')
    expect(screen.getByText(/Compare this\s+with/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Copy message' }))
    await waitFor(() => {
      expect(writeClipboardText).toHaveBeenCalledWith('Compare this  with `[Image #1]`')
    })
  })

  it('omits the copy button when a user message has only its sent [Image #1] marker and image', () => {
    render(
      <TooltipProvider>
        <MessageRow
          message={{
            id: 'image-only',
            role: 'user',
            timestamp: 0,
            source: 'transcript',
            blocks: [
              { type: 'text', text: '[Image #1]' },
              { type: 'image-ref', path: '/tmp/screenshot.png', alt: 'Screenshot' }
            ]
          }}
          expandSignal={false}
          onScrollMessageToTop={vi.fn()}
        />
      </TooltipProvider>
    )
    expect(screen.queryByText(/\[Image #1\]/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Copy message' })).toBeNull()
  })
})

function withThoughtTiming(
  timing: NativeChatThoughtTiming,
  row: React.JSX.Element
): React.JSX.Element {
  return (
    <NativeChatThoughtTimingContext.Provider value={timing}>
      {row}
    </NativeChatThoughtTimingContext.Provider>
  )
}

describe('MessageRow thoughts', () => {
  function renderThought(
    text: string,
    timing: { seconds?: Record<string, number | null>; merged?: string[] } = {}
  ) {
    return render(
      withThoughtTiming(
        {
          seconds: new Map(Object.entries(timing.seconds ?? {})),
          merged: new Set(timing.merged ?? [])
        },
        <MessageRow
          message={{
            id: 'thought',
            role: 'reasoning',
            timestamp: 1_000,
            source: 'transcript',
            blocks: [{ type: 'text', text }]
          }}
          expandSignal={false}
          onScrollMessageToTop={vi.fn()}
        />
      )
    )
  }

  it('draws a thought with no text as one line with nothing to open', () => {
    const { container } = renderThought('')
    expect(screen.getByText('Thought')).toBeTruthy()
    expect(container.querySelector('[data-native-chat-thought-marker]')).not.toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('times a thought with no text from the journal when the host kept no timing', () => {
    renderThought('', { seconds: { thought: 7 } })
    expect(screen.getByText('Thought for 7s')).toBeTruthy()
  })

  it('draws nothing for a thought folded into the one before it', () => {
    const { container } = renderThought('', { merged: ['thought'] })
    expect(container.textContent).toBe('')
  })

  it("keeps the host's own timing over the journal's", () => {
    render(
      withThoughtTiming(
        { seconds: new Map([['thought', 99]]), merged: new Set<string>() },
        <MessageRow
          message={{
            id: 'thought',
            role: 'reasoning',
            timestamp: 1_000,
            state: 'completed',
            completedAt: 4_000,
            source: 'transcript',
            blocks: [{ type: 'text', text: 'Weighing options' }]
          }}
          expandSignal={false}
          onScrollMessageToTop={vi.fn()}
        />
      )
    )
    expect(screen.getByRole('button', { name: /Thought for 3s/ })).toBeTruthy()
  })

  it('uses the journal duration for a thought with text only when the host gave none', () => {
    renderThought('Weighing options', { seconds: { thought: 12 } })
    expect(screen.getByRole('button', { name: /Thought for 12s/ })).toBeTruthy()
  })
})
