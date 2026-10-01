import { describe, expect, it } from 'vitest'
import { resolveMobileNativeChatProject } from './mobile-native-chat-project'

describe('a workspace list alone', () => {
  it('names a project when the repo list is missing', () => {
    // The hook adds a repo per row it has not listed; mirror that here.
    const row = {
      worktreeId: 'r9::/w',
      repoId: 'r9',
      repo: 'slack-mcp',
      branch: 'refs/heads/main',
      displayName: 'main',
      path: '/w',
      isMainWorktree: true,
      liveTerminalCount: 0,
      hasAttachedPty: false,
      preview: '',
      unread: false,
      isPinned: false,
      linkedPR: null
    }
    const project = resolveMobileNativeChatProject(
      'slack-mcp/main',
      {
        repos: [{ id: 'r9', displayName: 'slack-mcp' }],
        worktrees: [row],
        hostReachable: true,
        loaded: true
      },
      0
    )
    expect(project?.worktreeId).toBe('r9::/w')
  })
})
