// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Repo } from '../../../../shared/repo-types'
import CommentMarkdown from '@/components/sidebar/CommentMarkdown'
import { useAppStore } from '@/store'
import { makeWorktree } from '../../store/slices/store-test-helpers'
import { renderNativeChatWorktreeLink } from './NativeChatProjectChip'
import type { NativeChatProjectLiveStatus } from './use-native-chat-project-live-status'

const mocks = vi.hoisted(() => {
  const state: { live: NativeChatProjectLiveStatus; activate: ReturnType<typeof vi.fn> } = {
    live: { status: 'needs-you', liveLine: null },
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
  id: 'repo-orca',
  path: '/code/orca-personal',
  displayName: 'orca-personal',
  badgeColor: '#737373',
  addedAt: 0,
  connectionId: 'box'
}
const personal = makeWorktree({
  id: 'repo-orca::/code/ws/personal',
  repoId: repo.id,
  displayName: 'personal'
})

function renderReply(content: string) {
  return render(
    <CommentMarkdown
      content={content}
      variant="document"
      renderWorktreeLink={renderNativeChatWorktreeLink}
    />
  )
}

beforeEach(() => {
  useAppStore.setState({ repos: [repo], worktreesByRepo: { [repo.id]: [personal] } })
})

afterEach(() => {
  cleanup()
  mocks.activate.mockReset()
})

describe('NativeChatProjectChip', () => {
  it('draws a known workspace as a pill with its status and focuses it on click', () => {
    renderReply('Pushed [orca](orca-worktree:orca-personal/personal) just now.')
    const chip = screen.getByRole('button', { name: 'Open orca-personal · personal, Needs you' })
    expect(chip).toHaveTextContent('orca-personal')
    expect(chip).toHaveTextContent('personal')
    expect(chip).toHaveAttribute('data-project-status', 'needs-you')
    // An SSH repo never searches the disk for an app icon: it gets the monogram.
    expect(chip.querySelector('img')).toBeNull()
    expect(chip).toHaveTextContent('O')
    fireEvent.click(chip)
    expect(mocks.activate).toHaveBeenCalledWith(personal.id, 'ssh:box')
  })

  it.each([
    ['a local', undefined],
    ['an SSH', 'box']
  ])(
    "draws the sidebar's repo icon for %s repo without asking main for an app icon",
    (_label, connectionId) => {
      const getAppIcon = vi.fn(async () => null)
      vi.stubGlobal('api', { repos: { getAppIcon } })
      const src = 'https://github.com/3sidedcube-orca.png?size=64'
      useAppStore.setState({
        repos: [{ ...repo, connectionId, repoIcon: { type: 'image', src, source: 'github' } }]
      })
      renderReply('See [orca](orca-worktree:orca-personal/personal).')
      const chip = screen.getByRole('button', { name: /Open orca-personal/ })
      expect(chip.querySelector('img')).toHaveAttribute('src', src)
      expect(getAppIcon).not.toHaveBeenCalled()
      vi.unstubAllGlobals()
    }
  )

  it('reads an unknown workspace as plain text, with no error', () => {
    renderReply('See [the old one](orca-worktree:orca-personal/gone).')
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByText('the old one')).toBeInTheDocument()
    expect(document.querySelector('a')).toBeNull()
  })
})
