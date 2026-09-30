// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NativeChatMessage } from '../../../../shared/native-chat-types'
import { MessageRow } from './NativeChatMessageRow'

afterEach(cleanup)

function renderMessage(role: NativeChatMessage['role'], timestamp: number | null = 0) {
  return render(
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
    />
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

    expect(screen.getByText('ts')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Copy code' }))

    await waitFor(() => {
      expect(writeClipboardText).toHaveBeenCalledWith('const answer = 42\n')
    })
  })

  it('appends time to the existing agent controls and inherits their reveal', () => {
    renderMessage('assistant')
    const copy = screen.getByRole('button', { name: 'Copy message' })
    const scroll = screen.getByRole('button', { name: 'Scroll this message to top' })
    const time = screen.getByRole('time')
    expect(Array.from(copy.parentElement!.children)).toEqual([copy, scroll, time])
    expect(copy.parentElement).toHaveClass(
      'can-hover:opacity-0',
      'can-hover:pointer-events-none',
      'group-hover:opacity-100',
      'group-has-[:focus-visible]:opacity-100',
      'group-hover:pointer-events-auto',
      'group-has-[:focus-visible]:pointer-events-auto'
    )
    expect(copy.parentElement).not.toHaveClass('opacity-0', 'pointer-events-none')
    expect(time).not.toHaveAttribute('tabindex')
    copy.focus()
    expect(copy).toHaveFocus()
  })

  it('gives user bubbles a copy button and timestamp that only hide on hover-capable devices', () => {
    renderMessage('user')
    const copy = screen.getByRole('button', { name: 'Copy message' })
    const time = screen.getByRole('time')
    expect(Array.from(copy.parentElement!.children)).toEqual([copy, time])
    expect(copy.parentElement).toHaveClass(
      'can-hover:opacity-0',
      'can-hover:pointer-events-none',
      'group-hover:opacity-100',
      'group-has-[:focus-visible]:opacity-100',
      'group-hover:pointer-events-auto',
      'group-has-[:focus-visible]:pointer-events-auto'
    )
    expect(copy.parentElement).not.toHaveClass('opacity-0', 'pointer-events-none')
    expect(copy.parentElement!.parentElement).toHaveClass('group')
    time.focus()
    expect(time).toHaveFocus()
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

  it('preserves chrome-free system rows', () => {
    renderMessage('system')
    expect(screen.queryByRole('time')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })
})

describe('MessageRow reasoning', () => {
  function renderThought(props: { thoughtSeconds?: number | null; thoughtLive?: boolean } = {}) {
    return render(
      <MessageRow
        message={{
          id: 'thought',
          role: 'reasoning',
          timestamp: 0,
          source: 'transcript',
          blocks: [{ type: 'text', text: 'Weighing the parser options.' }]
        }}
        expandSignal={false}
        onScrollMessageToTop={vi.fn()}
        {...props}
      />
    )
  }

  it('folds a settled thought to its derived duration and opens it on click', () => {
    renderThought({ thoughtSeconds: 12 })
    const toggle = screen.getByRole('button', { name: 'Thought for 12s' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Weighing the parser options.')).toBeNull()
    expect(screen.queryByRole('time')).toBeNull()

    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    const body = screen.getByText('Weighing the parser options.')
    expect(toggle.getAttribute('aria-controls')).toBe(body.closest('[id]')?.id)

    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Weighing the parser options.')).toBeNull()
  })

  it('opens from the keyboard', async () => {
    const user = userEvent.setup()
    renderThought({ thoughtSeconds: 3 })
    await user.tab()
    const toggle = screen.getByRole('button', { name: 'Thought for 3s' })
    expect(toggle).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await user.keyboard(' ')
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })

  it('says only "Thought" when no duration could be derived', () => {
    renderThought()
    expect(screen.getByRole('button', { name: 'Thought' })).toBeInTheDocument()
    expect(screen.queryByText(/Thought for/)).toBeNull()
  })

  it('reads "Thinking…" while it is the turn\'s newest output', () => {
    renderThought({ thoughtLive: true, thoughtSeconds: 4 })
    const toggle = screen.getByRole('button', { name: 'Thinking…' })
    expect(toggle.closest('[data-native-chat-thought]')).toHaveAttribute(
      'data-native-chat-thought',
      'live'
    )
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
