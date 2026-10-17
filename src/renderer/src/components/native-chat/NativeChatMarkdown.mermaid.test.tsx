// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Why: these fixtures have neither inline visual owners nor sender navigation.
const unusedChatLeaves = vi.hoisted(() => ({
  inlineVisual: vi.fn(() => {
    throw new Error('Unexpected inline visual in transcript fixture')
  })
}))
vi.mock('./NativeChatInlineVisual', () => ({
  NativeChatInlineVisual: unusedChatLeaves.inlineVisual
}))
afterEach(() => {
  expect(unusedChatLeaves.inlineVisual).not.toHaveBeenCalled()
})

const mermaid = vi.hoisted(() => ({ initialize: vi.fn(), render: vi.fn() }))
vi.mock('mermaid', () => ({ default: mermaid }))
vi.mock('dompurify', () => ({ default: { sanitize: (svg: string) => svg } }))
vi.mock('@/store', () => ({
  useAppStore: (selector: (state: { settings: { theme: string } }) => unknown) =>
    selector({ settings: { theme: 'light' } })
}))

import { NativeChatMarkdown } from './NativeChatMarkdown'
import { NativeChatCodeBlock } from './NativeChatCodeBlock'
import {
  NativeChatFencePreviewContext,
  nativeChatFences,
  type NativeChatFencePreviewScope
} from './native-chat-fence-preview'
import { TooltipProvider } from '@/components/ui/tooltip'

const partial = 'flowchart TD\n A["Sync with main '
const complete = `${partial}once"]`

function inReply(scope: NativeChatFencePreviewScope, node: React.JSX.Element): React.JSX.Element {
  return (
    <NativeChatFencePreviewContext.Provider value={scope}>
      {node}
    </NativeChatFencePreviewContext.Provider>
  )
}

// As a reply row draws it: the row's fence scope holds back a fence still streaming.
function reply(source: string, streaming: boolean): React.JSX.Element {
  const content = `Here is the plan:\n\n\`\`\`mermaid\n${source}${streaming ? '' : '\n```'}`
  const fences = nativeChatFences(content)
  return (
    <TooltipProvider>
      {inReply(
        {
          markupPreviews: true,
          openFenceBody: fences.open,
          messageId: 'reply',
          fenceBodies: fences.closed
        },
        <NativeChatMarkdown
          content={content}
          variant="document"
          renderCodeBlock={NativeChatCodeBlock}
          streaming={streaming}
        />
      )}
    </TooltipProvider>
  )
}

const heldRenders: PromiseWithResolvers<{ svg: string }>[] = []
/** Holds the next Mermaid render until the test settles it. */
function holdNextRender(): PromiseWithResolvers<{ svg: string }> {
  const held = Promise.withResolvers<{ svg: string }>()
  heldRenders.push(held)
  mermaid.render.mockReturnValueOnce(held.promise)
  return held
}

beforeEach(() => {
  mermaid.render.mockReset()
  mermaid.render.mockResolvedValue({ svg: '<svg><text>Sync with main once</text></svg>' })
})
afterEach(() => {
  cleanup()
  // Renders share one queue: a render a failed test left held would stall the next test's.
  for (const held of heldRenders.splice(0)) {
    held.resolve({ svg: '<svg />' })
  }
})

// The chat's code-block renderer owns mermaid fences: a finished one draws in the themed
// diagram card (with a Code toggle), never Mermaid's stock render.
describe('native chat Mermaid fences', () => {
  it('shows partial source while streaming and renders the diagram when the reply finishes', async () => {
    const { container, rerender } = render(reply(partial, true))
    expect(container.querySelector('[data-native-chat-code-content]')?.textContent).toContain(
      partial
    )
    expect(container.querySelector('[data-native-chat-diagram]')).toBeNull()
    expect(mermaid.render).not.toHaveBeenCalled()

    rerender(reply(complete, true))
    expect(container.querySelector('pre')?.textContent).toContain(complete)

    rerender(reply(complete, false))
    await waitFor(() =>
      expect(container.querySelector('.mermaid-block svg')).toHaveTextContent('Sync with main once')
    )
    expect(mermaid.render).toHaveBeenCalledWith(expect.any(String), complete)
    expect(container.querySelector('[data-native-chat-diagram="mermaid"]')).not.toBeNull()
    expect(screen.queryByText(/Diagram error:/)).not.toBeInTheDocument()
  })

  it('still shows the error and source for an invalid finished reply', async () => {
    mermaid.render.mockRejectedValue(new Error('Invalid mermaid syntax'))
    const { container } = render(reply(partial, false))
    await screen.findByText(/Diagram error: Invalid mermaid syntax/)
    expect(container.querySelector('.mermaid-block pre')?.textContent).toBe(partial.trimEnd())
    expect(container.querySelector('.mermaid-block svg')).toBeNull()
  })

  it('renders the updated diagram when a previously rendered fence grows again', async () => {
    const view = render(reply(complete, false))
    await waitFor(() =>
      expect(view.container.querySelector('.mermaid-block svg')).toBeInTheDocument()
    )
    const next = `${complete}\n B["Next step"]`
    view.rerender(reply(next, true))
    expect(view.container.querySelector('pre')).toHaveTextContent('Next step')
    const pending = holdNextRender()
    view.rerender(reply(next, false))
    await waitFor(() => expect(mermaid.render).toHaveBeenCalledTimes(2))
    await act(async () => pending.resolve({ svg: '<svg><text>Next step</text></svg>' }))
    expect(view.container.querySelector('.mermaid-block svg')).toHaveTextContent('Next step')
  })

  it('does not run Mermaid on a reply that is still streaming', async () => {
    const finished = 'flowchart TD\n S["Finished elsewhere"]'
    render(
      <>
        {reply(partial, true)}
        {reply(finished, false)}
      </>
    )
    // Renders run in order, so the finished diagram rendering means the streaming one's turn passed.
    await waitFor(() => expect(mermaid.render).toHaveBeenCalledWith(expect.any(String), finished))
    expect(mermaid.render).toHaveBeenCalledTimes(1)
  })
})
