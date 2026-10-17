// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

// Why: these fixtures have neither inline visual owners nor sender navigation.
const unusedChatLeaves = vi.hoisted(() => ({
  inlineVisual: vi.fn(() => {
    throw new Error('Unexpected inline visual in transcript fixture')
  }),
  openSender: vi.fn(() => {
    throw new Error('Unexpected sender navigation in transcript fixture')
  })
}))
vi.mock('./NativeChatInlineVisual', () => ({
  NativeChatInlineVisual: unusedChatLeaves.inlineVisual
}))
vi.mock('@/lib/open-agent-message-sender', () => ({
  openAgentMessageSender: unusedChatLeaves.openSender
}))
afterEach(() => {
  expect(unusedChatLeaves.inlineVisual).not.toHaveBeenCalled()
  expect(unusedChatLeaves.openSender).not.toHaveBeenCalled()
})
import type { NativeChatMessage } from '../../../../shared/native-chat-types'
import { MessageRow, type NativeChatDeliveryNotice } from './NativeChatMessageRow'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { NativeChatRewindSurface } from './use-native-chat-rewind'
import { readNativeChatQuotableSelection } from './native-chat-quote-selection'
import {
  NativeChatThoughtTimingContext,
  type NativeChatThoughtTiming
} from './native-chat-thought-markers'

const confirm = vi.hoisted(() => vi.fn())
vi.mock('@/lib/syntax-highlighting/oniguruma', async () => ({
  loadOniguruma: (await import('@/lib/syntax-highlighting/oniguruma-test-harness'))
    .loadNodeOniguruma
}))
vi.mock('@/components/confirmation-dialog-context', () => ({
  useConfirmationDialog: () => confirm
}))

afterEach(cleanup)

function renderMessage(
  role: NativeChatMessage['role'],
  timestamp: number | null = 0,
  rewind?: NativeChatRewindSurface
) {
  return render(
    <TooltipProvider>
      <MessageRow
        message={{
          id: 'message',
          role,
          timestamp,
          source: 'transcript',
          blocks: [{ type: 'text', text: 'Message text' }]
        }}
        expandSignal={false}
        onScrollMessageToTop={vi.fn()}
        rewind={rewind}
      />
    </TooltipProvider>
  )
}

describe('MessageRow control visibility', () => {
  it('renders and copies a fenced code block through the markdown path', async () => {
    const writeClipboardText = vi.fn().mockResolvedValue(undefined)
    Object.assign(window, { api: { ui: { writeClipboardText } } })

    render(
      <MessageRow
        message={{
          id: 'message',
          role: 'assistant',
          timestamp: 0,
          source: 'transcript',
          blocks: [{ type: 'text', text: '```ts\nconst answer = 42\n```' }]
        }}
        expandSignal={false}
        onScrollMessageToTop={vi.fn()}
      />
    )

    expect(screen.getByText('TypeScript')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Copy code' }))

    await waitFor(() => {
      expect(writeClipboardText).toHaveBeenCalledWith('const answer = 42\n')
    })
  })

  it('composes the edit-from-here action into the user hover/focus strip', () => {
    const request = vi.fn()
    renderMessage('user', 0, { disabledReason: null, request })
    const copy = screen.getByRole('button', { name: 'Copy message' })
    const time = screen.getByRole('time')
    const edit = screen.getByRole('button', { name: 'Rewind to here' })
    expect(Array.from(copy.parentElement!.children)).toEqual([copy, time, edit])
    expect(copy.parentElement).toHaveClass('can-hover:opacity-0', 'group-hover:opacity-100')
    edit.focus()
    expect(edit).toHaveFocus()
    fireEvent.click(edit)
    expect(request).toHaveBeenCalledWith('message', confirm)
  })

  it('copies the sent message text from a user bubble', async () => {
    const writeClipboardText = vi.fn().mockResolvedValue(undefined)
    Object.assign(window, { api: { ui: { writeClipboardText } } })

    renderMessage('user')
    fireEvent.click(screen.getByRole('button', { name: 'Copy message' }))

    await waitFor(() => {
      expect(writeClipboardText).toHaveBeenCalledWith('Message text')
    })
  })

  it('copies an assistant reply without its visual lines, which mean nothing outside Orca', async () => {
    const writeClipboardText = vi.fn().mockResolvedValue(undefined)
    Object.assign(window, { api: { ui: { writeClipboardText } } })

    render(
      <TooltipProvider>
        <MessageRow
          message={{
            id: 'message',
            role: 'assistant',
            timestamp: 0,
            source: 'transcript',
            blocks: [
              {
                type: 'text',
                text: 'Here it is.\n\n::orca-visual{file="usage.html" title="Usage"}\n\nDone.'
              }
            ]
          }}
          expandSignal={false}
          onScrollMessageToTop={vi.fn()}
        />
      </TooltipProvider>
    )
    fireEvent.click(screen.getByRole('button', { name: 'Copy message' }))

    await waitFor(() => {
      expect(writeClipboardText).toHaveBeenCalledWith('Here it is.\n\nDone.')
    })
  })

  it('omits the copy button on image-only user messages', () => {
    render(
      <MessageRow
        message={{
          id: 'message',
          role: 'user',
          timestamp: 0,
          source: 'transcript',
          blocks: [{ type: 'image-ref', path: '/tmp/screenshot.png', alt: 'Screenshot' }]
        }}
        expandSignal={false}
        onScrollMessageToTop={vi.fn()}
      />
    )
    expect(screen.queryByRole('button', { name: 'Copy message' })).toBeNull()
    expect(screen.getByRole('time')).toBeInTheDocument()
  })

  it.each(['assistant', 'user'] as const)('omits unknown timestamps on %s rows', (role) => {
    renderMessage(role, null)
    expect(screen.queryByRole('time')).toBeNull()
    expect(screen.getByText('Message text')).toBeInTheDocument()
    expect(screen.queryAllByRole('button')).toHaveLength(role === 'assistant' ? 2 : 1)
  })

  it.each(['reasoning', 'system'] as const)(
    'omits timestamp and agent controls on %s rows',
    (role) => {
      renderMessage(role)
      expect(screen.queryByRole('time')).toBeNull()
      expect(screen.queryByRole('button', { name: 'Copy message' })).toBeNull()
      expect(screen.queryByRole('button', { name: 'Scroll this message to top' })).toBeNull()
      expect(screen.queryAllByRole('button')).toHaveLength(role === 'reasoning' ? 1 : 0)
    }
  )

  it('holds the agent controls back until the turn stops working', () => {
    const row = (activeTurnIsWorking: boolean) => (
      <TooltipProvider>
        <MessageRow
          message={{
            id: 'message',
            role: 'assistant',
            timestamp: 0,
            source: 'transcript',
            blocks: [{ type: 'text', text: 'Message text' }]
          }}
          expandSignal={false}
          activeTurnIsWorking={activeTurnIsWorking}
          trailingRun
          onScrollMessageToTop={vi.fn()}
        />
      </TooltipProvider>
    )
    const { rerender } = render(row(true))
    expect(screen.getByText('Message text')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Copy message' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Scroll this message to top' })).toBeNull()
    expect(screen.queryByRole('time')).toBeNull()

    rerender(row(false))
    expect(screen.getByRole('button', { name: 'Copy message' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Scroll this message to top' })).toBeInTheDocument()
    expect(screen.getByRole('time')).toBeInTheDocument()
  })
})

describe('which messages can be quoted', () => {
  it.each([
    ['assistant', 'Message text'],
    ['user', undefined],
    ['system', undefined]
  ] as const)('a selection in a %s message', (role, quoted) => {
    const { container } = renderMessage(role)
    window.getSelection()!.selectAllChildren(screen.getByText('Message text'))

    expect(readNativeChatQuotableSelection(container)?.text).toBe(quoted)
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
    expect(screen.getByText('Thought')).toBeInTheDocument()
    expect(container.querySelector('[data-native-chat-thought-marker]')).not.toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('times a thought with no text from the journal when the host kept no timing', () => {
    renderThought('', { seconds: { thought: 7 } })
    expect(screen.getByText('Thought for 7s')).toBeInTheDocument()
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
    expect(screen.getByRole('button', { name: /Thought for 3s/ })).toBeInTheDocument()
  })

  it('uses the journal duration for a thought with text only when the host gave none', () => {
    renderThought('Weighing options', { seconds: { thought: 12 } })
    expect(screen.getByRole('button', { name: /Thought for 12s/ })).toBeInTheDocument()
  })
})

describe('MessageRow send mode', () => {
  function renderUser(sentAs?: NativeChatMessage['sentAs']) {
    return render(
      <MessageRow
        message={{
          id: 'message',
          role: 'user',
          timestamp: 0,
          source: 'transcript',
          blocks: [{ type: 'text', text: 'Ship the parser' }],
          ...(sentAs ? { sentAs } : {})
        }}
        expandSignal={false}
        onScrollMessageToTop={vi.fn()}
      />
    )
  }

  it('marks a user message that was sent as a goal', () => {
    renderUser('goal')
    expect(screen.getByText('Ship the parser')).toBeInTheDocument()
    expect(screen.getByText('Sent as goal')).toBeInTheDocument()
  })

  it('leaves an ordinary user message unmarked', () => {
    renderUser()
    expect(screen.queryByText('Sent as goal')).not.toBeInTheDocument()
  })
})

describe('what a user message says about its delivery', () => {
  function renderUser(deliveryNotice?: NativeChatDeliveryNotice) {
    return render(
      <MessageRow
        message={{
          id: 'message',
          role: 'user',
          timestamp: 0,
          source: 'transcript',
          blocks: [{ type: 'text', text: 'Message text' }]
        }}
        expandSignal={false}
        onScrollMessageToTop={vi.fn()}
        deliveryNotice={deliveryNotice}
      />
    )
  }

  it('says why under the message, with no control where the surface has none', () => {
    renderUser({ text: 'Not delivered — check the terminal' })

    expect(screen.getByText('Not delivered — check the terminal')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull()
  })

  it('says nothing when it went through', () => {
    renderUser()
    expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull()
  })

  // Muted, in the time's place, and shown without hover: a message nothing confirmed yet never
  // looks like one that went through. Copy keeps its hover reveal, and the row its height.
  it('says quietly that it is still sending in place of its time, with no Retry', () => {
    renderUser({ sending: true })

    const sending = screen.getByText('Sending…')
    const copy = screen.getByRole('button', { name: 'Copy message' })
    expect(sending).toHaveClass('text-xs', 'text-chat-foreground-faint')
    expect(Array.from(sending.parentElement!.children)).toEqual([copy, sending])
    expect(sending.parentElement).not.toHaveClass('can-hover:opacity-0')
    expect(sending.parentElement!.parentElement).toHaveClass('group')
    expect(copy).toHaveClass('can-hover:opacity-0', 'group-hover:opacity-100')
    expect(screen.queryByRole('time')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull()
  })

  it('keeps the same row when the message is confirmed, with the time back in its place', () => {
    const { rerender } = renderUser({ sending: true })
    const meta = screen.getByText('Sending…').parentElement
    rerender(
      <MessageRow
        message={{
          id: 'message',
          role: 'user',
          timestamp: 0,
          source: 'transcript',
          blocks: [{ type: 'text', text: 'Message text' }]
        }}
        expandSignal={false}
        onScrollMessageToTop={vi.fn()}
      />
    )
    expect(screen.queryByText('Sending…')).toBeNull()
    expect(screen.getByRole('time').parentElement).toBe(meta)
    expect(meta).toHaveClass('can-hover:opacity-0')
  })
})
