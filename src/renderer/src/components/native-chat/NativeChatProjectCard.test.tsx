// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NativeChatMessage } from '../../../../shared/native-chat-types'
import type { Repo } from '../../../../shared/repo-types'
import { useAppStore } from '@/store'
import { makeWorktree } from '../../store/slices/store-test-helpers'
import { NativeChatCodeBlock } from './NativeChatCodeBlock'
import {
  NativeChatFencePreviewContext,
  type NativeChatFencePreviewScope
} from './native-chat-fence-preview'
import {
  NativeChatProjectReplyContext,
  type NativeChatProjectReplyChannel
} from './native-chat-project-reply-context'
import type { NativeChatProjectLiveStatus } from './use-native-chat-project-live-status'

const mocks = vi.hoisted(() => {
  const state: { live: NativeChatProjectLiveStatus; activate: ReturnType<typeof vi.fn> } = {
    live: { status: 'working', liveLine: null },
    activate: vi.fn()
  }
  return state
})

vi.mock('./use-native-chat-project-live-status', () => ({
  useNativeChatProjectLiveStatus: () => mocks.live
}))
vi.mock('@/lib/sidebar-worktree-activation', () => ({
  activateWorktreeFromSidebar: mocks.activate
}))

const repo: Repo = {
  id: 'repo-images',
  path: '/code/ImageReview',
  displayName: 'ImageReview',
  badgeColor: '#737373',
  addedAt: 0
}
const packaging = makeWorktree({
  id: 'repo-images::/code/ws/packaging',
  repoId: repo.id,
  displayName: 'packaging'
})

const CARD = JSON.stringify({
  worktree: 'ImageReview/packaging',
  note: 'Testing a fix in fixtest.py',
  ask: 'Commit skipped the pre-commit hook. Fix pnpm first?',
  icon: '🖼',
  actions: [
    { label: 'Approve', reply: 'Approve: fix pnpm and re-run the hook', style: 'primary' },
    { label: 'Reply…', input: true }
  ]
})

function message(id: string, role: NativeChatMessage['role'], text: string): NativeChatMessage {
  return { id, role, blocks: [{ type: 'text', text }], timestamp: null, source: 'transcript' }
}

const REPLY_SCOPE: NativeChatFencePreviewScope = {
  markupPreviews: true,
  openFenceBody: null,
  messageId: 'a1'
}
const USER_SCOPE: NativeChatFencePreviewScope = { ...REPLY_SCOPE, markupPreviews: false }

function renderCard(
  source: string,
  channel: NativeChatProjectReplyChannel | null,
  { reply = true } = {}
) {
  return render(
    <NativeChatFencePreviewContext.Provider value={reply ? REPLY_SCOPE : USER_SCOPE}>
      <NativeChatProjectReplyContext.Provider value={channel}>
        <NativeChatCodeBlock language="project-card">
          <code className="language-project-card">{source}</code>
        </NativeChatCodeBlock>
      </NativeChatProjectReplyContext.Provider>
    </NativeChatFencePreviewContext.Provider>
  )
}

beforeEach(() => {
  useAppStore.setState({ repos: [repo], worktreesByRepo: { [repo.id]: [packaging] } })
  mocks.live = { status: 'working', liveLine: { text: 'Bash: pytest', time: 'for 4m' } }
})

afterEach(() => {
  cleanup()
  localStorage.clear()
  mocks.activate.mockReset()
})

describe('NativeChatProjectCard', () => {
  it('draws the project, its live line, the note and ask as written, and its actions', () => {
    renderCard(CARD, { send: vi.fn(), canSend: true, messages: [] })
    const card = document.querySelector('[data-native-chat-project-card]')
    expect(card).not.toBeNull()
    expect(screen.getByText('ImageReview')).toBeInTheDocument()
    expect(screen.getByText('packaging')).toBeInTheDocument()
    expect(screen.getByText('Working')).toBeInTheDocument()
    expect(screen.getByText('Bash: pytest')).toBeInTheDocument()
    expect(screen.getByText('· for 4m')).toBeInTheDocument()
    expect(screen.getByText('Testing a fix in fixtest.py')).toBeInTheDocument()
    expect(screen.getByText(/Fix pnpm first\?/)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Approve.*Sends “Approve: fix pnpm and re-run the hook”/ })
    ).toBeEnabled()
  })

  it('follows the live status after the reply was written', () => {
    const { rerender } = renderCard(CARD, null)
    expect(document.querySelector('[data-project-status="working"]')).not.toBeNull()
    mocks.live = { status: 'done', liveLine: { text: 'All tests pass', time: '2m ago' } }
    rerender(
      <NativeChatFencePreviewContext.Provider value={REPLY_SCOPE}>
        <NativeChatProjectReplyContext.Provider value={null}>
          <NativeChatCodeBlock language="project-card">
            <code className="language-project-card">{CARD}</code>
          </NativeChatCodeBlock>
        </NativeChatProjectReplyContext.Provider>
      </NativeChatFencePreviewContext.Provider>
    )
    expect(screen.getByText('Done')).toBeInTheDocument()
    expect(screen.getByText('All tests pass')).toBeInTheDocument()
    expect(screen.getByText('Testing a fix in fixtest.py')).toBeInTheDocument()
  })

  it('opens the workspace it names', () => {
    renderCard(CARD, null)
    fireEvent.click(screen.getByRole('button', { name: 'Open ImageReview packaging' }))
    expect(mocks.activate).toHaveBeenCalledWith(packaging.id, 'local')
  })

  it('sends an action as a user message once, then disables every action', () => {
    const send = vi.fn(() => true)
    renderCard(CARD, { send, canSend: true, messages: [] })
    const approve = screen.getByRole('button', { name: /^Approve/ })
    fireEvent.click(approve)
    expect(send).toHaveBeenCalledWith('Approve: fix pnpm and re-run the hook')
    expect(screen.getByRole('button', { name: /Sent “Approve: fix pnpm/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^Reply…/ })).toBeDisabled()
    fireEvent.click(approve)
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('stays enabled when the composer could not send', () => {
    const send = vi.fn(() => false)
    renderCard(CARD, { send, canSend: true, messages: [] })
    fireEvent.click(screen.getByRole('button', { name: /^Approve/ }))
    expect(screen.getByRole('button', { name: /^Approve/ })).toBeEnabled()
  })

  it('reads the choice back from the transcript after a reload', () => {
    renderCard(CARD, {
      send: vi.fn(),
      canSend: true,
      messages: [
        message('a1', 'assistant', 'card'),
        message('u2', 'user', 'Approve: fix pnpm and re-run the hook')
      ]
    })
    expect(screen.getByRole('button', { name: /Sent “Approve/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^Reply…/ })).toBeDisabled()
  })

  it('sends a typed reply and remembers it across a remount', () => {
    const send = vi.fn(() => true)
    const { unmount } = renderCard(CARD, { send, canSend: true, messages: [] })
    fireEvent.click(screen.getByRole('button', { name: /^Reply…/ }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Reply…' }), {
      target: { value: 'Try the other fix' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(send).toHaveBeenCalledWith('Try the other fix')
    unmount()
    renderCard(CARD, { send, canSend: true, messages: [] })
    expect(screen.getByRole('button', { name: /Sent “Try the other fix”/ })).toBeDisabled()
  })

  it('keeps actions disabled outside a chat that can send', () => {
    renderCard(CARD, null)
    expect(screen.getByRole('button', { name: /^Approve/ })).toBeDisabled()
  })

  it.each([
    ['bad JSON', '{"worktree": "ImageReview/packaging",'],
    ['an unknown workspace', JSON.stringify({ worktree: 'ImageReview/gone' })]
  ])('shows the raw block for %s, never a blank', (_name, source) => {
    renderCard(source, null)
    expect(document.querySelector('[data-native-chat-project-card]')).toBeNull()
    expect(document.querySelector('[data-code-language="project-card"]')).not.toBeNull()
    expect(document.querySelector('pre')).toHaveTextContent(source)
  })

  it('stays code outside an assistant reply', () => {
    renderCard(CARD, null, { reply: false })
    expect(document.querySelector('[data-native-chat-project-card]')).toBeNull()
    expect(document.querySelector('pre')).toHaveTextContent('ImageReview/packaging')
  })
})
