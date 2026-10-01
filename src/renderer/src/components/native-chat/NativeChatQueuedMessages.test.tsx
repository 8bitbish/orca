// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TerminalMessageQueueSnapshot } from '../../../../shared/terminal-message-queue-contract'

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string, values?: Record<string, unknown>) =>
    fallback.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => String(values?.[name] ?? ''))
}))

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: () => null
}))

import {
  NativeChatQueuedMessages,
  type NativeChatQueuedMessagesProps
} from './NativeChatQueuedMessages'

function snapshot(
  overrides: Partial<TerminalMessageQueueSnapshot> = {}
): TerminalMessageQueueSnapshot {
  return {
    revision: 1,
    lead: 'working',
    interrupting: false,
    terminal: 'live',
    items: [
      { id: 'a', text: 'first queued', queuedAt: 1, state: 'queued' },
      { id: 'b', text: 'second queued', queuedAt: 2, state: 'queued' }
    ],
    ...overrides
  }
}

function renderStack(
  overrides: Partial<NativeChatQueuedMessagesProps> = {},
  onParentKeyDown?: () => void
) {
  const props: NativeChatQueuedMessagesProps = {
    snapshot: snapshot(),
    orphans: [],
    lastStop: null,
    onRemove: vi.fn(),
    onSetEditing: vi.fn(),
    onSaveEdit: vi.fn(async () => true),
    onRestore: vi.fn(),
    onDiscardOrphan: vi.fn(),
    onSendNext: vi.fn(),
    ...overrides
  }
  render(
    <div onKeyDown={onParentKeyDown}>
      <NativeChatQueuedMessages {...props} />
    </div>
  )
  return props
}

afterEach(() => cleanup())

describe('NativeChatQueuedMessages', () => {
  it('renders nothing when nothing is queued', () => {
    const { container } = render(
      <NativeChatQueuedMessages
        snapshot={snapshot({ items: [] })}
        orphans={[]}
        lastStop={null}
        onRemove={vi.fn()}
        onSetEditing={vi.fn()}
        onSaveEdit={vi.fn()}
        onRestore={vi.fn()}
        onDiscardOrphan={vi.fn()}
        onSendNext={vi.fn()}
      />
    )
    expect(container.innerHTML).toBe('')
  })

  it('lists queued messages in order under a visible Queued heading', () => {
    renderStack()
    const region = screen.getByRole('region', { name: 'Queued messages' })
    expect(within(region).getByText('Queued · 2')).toBeTruthy()
    expect(within(region).getByText('Sends when the agent finishes')).toBeTruthy()
    const rows = within(region).getAllByRole('listitem')
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('first queued'),
      expect.stringContaining('second queued')
    ])
  })

  it('removes a queued message', () => {
    const props = renderStack()
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove from queue' })[1]!)
    expect(props.onRemove).toHaveBeenCalledWith('b')
  })

  it('edits inline: takes the lease, saves the new text, and releases on cancel', () => {
    const parentKeyDown = vi.fn()
    const props = renderStack({}, parentKeyDown)
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit queued message' })[0]!)
    expect(props.onSetEditing).toHaveBeenCalledWith('a', true)
    const editor = screen.getByRole('textbox', { name: 'Edit queued message' })
    fireEvent.change(editor, { target: { value: 'first, edited' } })
    fireEvent.keyDown(editor, { key: 'Enter' })
    expect(props.onSaveEdit).toHaveBeenCalledWith('a', 'first, edited')

    fireEvent.click(screen.getAllByRole('button', { name: 'Edit queued message' })[1]!)
    const second = screen.getByRole('textbox', { name: 'Edit queued message' })
    fireEvent.keyDown(second, { key: 'Escape' })
    expect(props.onSetEditing).toHaveBeenCalledWith('b', false)
    // Escape cancels the edit only; it must not reach the composer's Stop.
    expect(parentKeyDown).not.toHaveBeenCalled()
  })

  it('shows a delivering item as sending and offers no edit for it', () => {
    renderStack({
      snapshot: snapshot({
        items: [{ id: 'a', text: 'going out', queuedAt: 1, state: 'delivering' }]
      })
    })
    expect(screen.getByText('Sending…')).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Edit queued message' }).hasAttribute('disabled')
    ).toBe(true)
  })

  it('offers undeliverable and lost messages back to the composer', () => {
    const props = renderStack({
      snapshot: snapshot({
        terminal: 'exited',
        items: [
          {
            id: 'a',
            text: 'never sent',
            queuedAt: 1,
            state: 'undeliverable',
            undeliverableReason: 'exited'
          }
        ]
      }),
      orphans: [{ id: 'x', text: 'lost one', reason: 'lost' }]
    })
    expect(screen.getByText('Not sent — the terminal closed')).toBeTruthy()
    expect(screen.getByText('Not sent — the queue was lost')).toBeTruthy()
    const restore = screen.getAllByRole('button', { name: 'Restore to composer' })
    fireEvent.click(restore[0]!)
    expect(props.onRestore).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }), false)
    fireEvent.click(restore[1]!)
    expect(props.onRestore).toHaveBeenCalledWith(expect.objectContaining({ id: 'x' }), true)
    fireEvent.click(screen.getAllByRole('button', { name: 'Discard message' })[1]!)
    expect(props.onDiscardOrphan).toHaveBeenCalledWith('x')
  })

  it('says when Stop could not be confirmed and lets the user send the next one', () => {
    const props = renderStack({ lastStop: 'unverifiable' })
    fireEvent.click(screen.getByRole('button', { name: 'Send next now' }))
    expect(props.onSendNext).toHaveBeenCalled()
  })

  it('names the hold reason while a dialog is open or Stop is in flight', () => {
    renderStack({ snapshot: snapshot({ lead: 'dialog' }) })
    expect(screen.getByText('Waiting for you to answer the agent')).toBeTruthy()
    cleanup()
    renderStack({ snapshot: snapshot({ interrupting: true }) })
    expect(screen.getByText('Stopping the agent…')).toBeTruthy()
  })
})
