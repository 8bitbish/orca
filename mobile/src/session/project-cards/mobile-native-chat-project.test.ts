import { describe, expect, it } from 'vitest'
import type { Worktree } from '../../worktree/workspace-list-types'
import {
  pendingMobileNativeChatProject,
  resolveMobileNativeChatProject,
  type MobileNativeChatProjectCatalog
} from './mobile-native-chat-project'

const NOW = 1_000_000_000

function row(overrides: Partial<Worktree>): Worktree {
  return {
    worktreeId: 'r1::/w/main',
    repoId: 'r1',
    repo: 'orca',
    branch: 'main',
    displayName: 'main',
    path: '/w/main',
    isMainWorktree: true,
    liveTerminalCount: 0,
    hasAttachedPty: false,
    preview: '',
    unread: false,
    isPinned: false,
    linkedPR: null,
    ...overrides
  }
}

function catalog(worktrees: Worktree[], hostReachable = true): MobileNativeChatProjectCatalog {
  return { repos: [{ id: 'r1', displayName: 'orca' }], worktrees, hostReachable, loaded: true }
}

describe('resolveMobileNativeChatProject', () => {
  const main = row({})
  const feature = row({
    worktreeId: 'r1::/w/cards',
    displayName: 'cards',
    branch: 'refs/heads/feature/cards',
    path: '/w/cards',
    isMainWorktree: false,
    status: 'working'
  })

  it('resolves a repo to its main workspace and repo/workspace to that workspace', () => {
    expect(resolveMobileNativeChatProject('orca', catalog([main, feature]), NOW)).toMatchObject({
      worktreeId: 'r1::/w/main',
      name: 'orca',
      workspace: null,
      status: 'idle'
    })
    expect(
      resolveMobileNativeChatProject('orca/feature/cards', catalog([main, feature]), NOW)
    ).toMatchObject({ worktreeId: 'r1::/w/cards', workspace: 'cards', status: 'working' })
    expect(
      resolveMobileNativeChatProject('r1::/w/cards', catalog([main, feature]), NOW)?.name
    ).toBe('orca')
  })

  it('names nothing for an unknown or ambiguous target', () => {
    expect(resolveMobileNativeChatProject('other', catalog([main]), NOW)).toBeNull()
    expect(
      resolveMobileNativeChatProject(
        'orca/x',
        catalog([
          row({ worktreeId: 'a', displayName: 'x' }),
          row({ worktreeId: 'b', displayName: 'x' })
        ]),
        NOW
      )
    ).toBeNull()
  })

  it('reads a blocked agent as needs-you, with its message as the live line', () => {
    const blocked = row({
      agents: [
        {
          paneKey: 'p1',
          parentPaneKey: null,
          state: 'blocked',
          agentType: 'claude',
          prompt: 'ship it',
          taskTitle: null,
          displayName: null,
          lastAssistantMessage: 'May I push?',
          toolName: null,
          toolInput: null,
          interrupted: false,
          stateStartedAt: NOW - 5 * 60_000,
          updatedAt: NOW
        }
      ]
    })
    expect(resolveMobileNativeChatProject('orca', catalog([blocked]), NOW)).toMatchObject({
      status: 'needs-you',
      liveLine: { text: 'May I push?', time: 'for 5m' }
    })
  })

  it('never reads a lost host as idle or done', () => {
    expect(
      resolveMobileNativeChatProject('orca', catalog([row({ status: 'done' })], false), NOW)
    ).toMatchObject({ status: 'unverifiable', liveLine: { time: null } })
  })

  it('names a not-yet-listed target as the reply wrote it, with nothing to open', () => {
    expect(pendingMobileNativeChatProject('orca-personal/personal')).toMatchObject({
      worktreeId: '',
      name: 'orca-personal',
      workspace: 'personal',
      status: 'unverifiable'
    })
  })
})
