// Where a chat Run runs: the chat's own workspace, or the one a `# workspace:` line
// names, on the host that executes that workspace. When it cannot run, why not.

import { createContext } from 'react'
import { isWslUncPath } from '../../../../shared/wsl-paths'
import { getSshTargetIdForExecutionHost } from '../../../../shared/execution-host'
import { parseWorkspaceKey } from '../../../../shared/workspace-scope'
import { WINDOWS_GIT_BASH_SHELL } from '../../../../shared/windows-terminal-shell'
import { getExecutionHostIdForWorktree } from '@/lib/worktree-runtime-owner'
import { runtimeTargetForExecutionHostId } from '@/runtime/runtime-client-target'
import type { AppState } from '@/store'
import {
  resolveNativeChatProjectTarget,
  type NativeChatProjectTarget
} from './native-chat-project-target'
import type { NativeChatShellRunWorkspace } from './native-chat-shell-run-engine'

/** What a reply's Run buttons need from the chat around them. */
export type NativeChatShellRunScope = {
  /** The chat's own workspace; null when the chat is in none. */
  worktreeId: string | null
  /** Keys the block's last run alongside the message id. */
  sessionId: string | null
}

/** No provider: the block is not in a chat that can run it. */
export const NativeChatShellRunContext = createContext<NativeChatShellRunScope | null>(null)

export type NativeChatShellRunUnavailable =
  | 'no-workspace'
  | 'unknown-workspace'
  | 'no-posix-shell'
  | 'host-unreachable'

export type NativeChatShellRunResolution =
  | {
      kind: 'ready'
      workspace: NativeChatShellRunWorkspace
      /** Set when a `# workspace:` line chose it, for the block's project chip. */
      target: NativeChatProjectTarget | null
      sshTargetId: string | null
    }
  | {
      kind: 'unavailable'
      reason: NativeChatShellRunUnavailable
      target: NativeChatProjectTarget | null
    }

type ResolverState = AppState

function workspacePath(state: ResolverState, worktreeId: string): string | null {
  const known = state.getKnownWorktreeById(worktreeId)?.path
  if (known) {
    return known
  }
  const listed = Object.values(state.worktreesByRepo)
    .flat()
    .find((worktree) => worktree.id === worktreeId)?.path
  if (listed) {
    return listed
  }
  const scope = parseWorkspaceKey(worktreeId)
  return scope?.type === 'folder'
    ? (state.folderWorkspaces.find((folder) => folder.id === scope.folderWorkspaceId)?.folderPath ??
        null)
    : null
}

export function resolveNativeChatShellRunWorkspace(
  state: ResolverState,
  args: {
    ownWorktreeId: string | null
    workspaceTarget: string | null
    /** The local OS, which only matters for local workspaces. */
    localPlatform: 'darwin' | 'linux' | 'win32' | 'other'
    /** Whether Git Bash exists on this Windows machine; null while unknown. */
    gitBashAvailable: boolean | null
  }
): NativeChatShellRunResolution {
  const target =
    args.workspaceTarget === null
      ? null
      : resolveNativeChatProjectTarget(args.workspaceTarget, state.repos, state.worktreesByRepo)
  if (args.workspaceTarget !== null && target === null) {
    return { kind: 'unavailable', reason: 'unknown-workspace', target: null }
  }
  const worktreeId = target?.worktree.id ?? args.ownWorktreeId
  const path =
    worktreeId === null ? null : (target?.worktree.path ?? workspacePath(state, worktreeId))
  if (worktreeId === null || path === null) {
    return { kind: 'unavailable', reason: 'no-workspace', target }
  }
  const hostId = getExecutionHostIdForWorktree(state, worktreeId)
  const sshTargetId = getSshTargetIdForExecutionHost(hostId)
  if (sshTargetId !== null && state.sshConnectionStates.get(sshTargetId)?.status !== 'connected') {
    return { kind: 'unavailable', reason: 'host-unreachable', target }
  }
  // SSH workspaces run through the local runtime's SSH provider, on the SSH host.
  const runtimeTarget = runtimeTargetForExecutionHostId(hostId) ?? { kind: 'local' as const }
  const localWindows =
    args.localPlatform === 'win32' && runtimeTarget.kind === 'local' && sshTargetId === null
  let shell: string | undefined
  if (localWindows && !isWslUncPath(path)) {
    if (args.gitBashAvailable !== true) {
      return { kind: 'unavailable', reason: 'no-posix-shell', target }
    }
    shell = WINDOWS_GIT_BASH_SHELL
  }
  return {
    kind: 'ready',
    workspace: { worktreeId, path, target: runtimeTarget, ...(shell ? { shell } : {}) },
    target,
    sshTargetId
  }
}
