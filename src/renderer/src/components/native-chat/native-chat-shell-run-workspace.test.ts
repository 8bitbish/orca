// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from 'vitest'
import type { Repo } from '../../../../shared/repo-types'
import { useAppStore } from '@/store'
import { makeWorktree } from '../../store/slices/store-test-helpers'
import { resolveNativeChatShellRunWorkspace } from './native-chat-shell-run-workspace'

const local: Repo = {
  id: 'local',
  path: '/code/app',
  displayName: 'app',
  badgeColor: '#737373',
  addedAt: 0
}
const remote: Repo = {
  ...local,
  id: 'remote',
  path: '/srv/api',
  displayName: 'api',
  connectionId: 'box'
}
const appMain = makeWorktree({
  id: 'local::/code/app',
  repoId: 'local',
  path: '/code/app',
  isMainWorktree: true
})
const apiMain = makeWorktree({
  id: 'remote::/srv/api',
  repoId: 'remote',
  path: '/srv/api',
  isMainWorktree: true
})

function resolve(
  args: Partial<Parameters<typeof resolveNativeChatShellRunWorkspace>[1]> = {}
): ReturnType<typeof resolveNativeChatShellRunWorkspace> {
  return resolveNativeChatShellRunWorkspace(useAppStore.getState(), {
    ownWorktreeId: appMain.id,
    workspaceTarget: null,
    localPlatform: 'darwin',
    gitBashAvailable: null,
    ...args
  })
}

beforeEach(() => {
  useAppStore.setState({
    repos: [local, remote],
    worktreesByRepo: { local: [appMain], remote: [apiMain] },
    sshConnectionStates: new Map()
  })
})

describe('resolveNativeChatShellRunWorkspace', () => {
  it('runs in the chat’s own workspace on the local runtime', () => {
    expect(resolve()).toMatchObject({
      kind: 'ready',
      workspace: { worktreeId: appMain.id, path: '/code/app', target: { kind: 'local' } },
      target: null
    })
  })

  it('follows a # workspace: target to its workspace', () => {
    const resolution = resolve({ workspaceTarget: 'api' })
    expect(resolution.kind).toBe('unavailable')
    useAppStore.setState({
      sshConnectionStates: new Map([
        ['box', { targetId: 'box', status: 'connected', error: null, reconnectAttempt: 0 }]
      ])
    })
    expect(resolve({ workspaceTarget: 'api' })).toMatchObject({
      kind: 'ready',
      workspace: { worktreeId: apiMain.id, path: '/srv/api', target: { kind: 'local' } },
      sshTargetId: 'box'
    })
  })

  it('refuses an SSH workspace whose host is not connected rather than running it here', () => {
    expect(resolve({ ownWorktreeId: apiMain.id })).toMatchObject({
      kind: 'unavailable',
      reason: 'host-unreachable'
    })
  })

  it('says why when the target or the chat’s workspace is unknown', () => {
    expect(resolve({ workspaceTarget: 'nope' })).toMatchObject({ reason: 'unknown-workspace' })
    expect(resolve({ ownWorktreeId: null })).toMatchObject({ reason: 'no-workspace' })
  })

  it('needs Git Bash for a local Windows workspace and spawns the Runs tab as it', () => {
    expect(resolve({ localPlatform: 'win32', gitBashAvailable: false })).toMatchObject({
      reason: 'no-posix-shell'
    })
    expect(resolve({ localPlatform: 'win32', gitBashAvailable: true })).toMatchObject({
      kind: 'ready',
      workspace: { shell: 'git-bash' }
    })
  })
})
