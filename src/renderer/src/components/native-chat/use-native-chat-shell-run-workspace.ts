import { useContext, useEffect, useMemo, useState } from 'react'
import { useAppStore } from '@/store'
import {
  NativeChatShellRunContext,
  resolveNativeChatShellRunWorkspace,
  type NativeChatShellRunResolution
} from './native-chat-shell-run-workspace'

type LocalPlatform = 'darwin' | 'linux' | 'win32' | 'other'

function localPlatform(): LocalPlatform {
  const agent = typeof navigator === 'undefined' ? '' : navigator.userAgent
  return /Windows/i.test(agent)
    ? 'win32'
    : /Mac/i.test(agent)
      ? 'darwin'
      : /Linux|X11/i.test(agent)
        ? 'linux'
        : 'other'
}

function signature(resolution: NativeChatShellRunResolution): string {
  const target = resolution.target?.worktree.id ?? ''
  if (resolution.kind === 'unavailable') {
    return `unavailable|${resolution.reason}|${target}`
  }
  const { workspace } = resolution
  const runtime = workspace.target.kind === 'local' ? 'local' : workspace.target.environmentId
  return `ready|${workspace.worktreeId}|${workspace.path}|${runtime}|${workspace.shell ?? ''}|${target}|${resolution.sshTargetId ?? ''}`
}

/** Where this reply's block would run, or null outside a chat that can run it. */
export function useNativeChatShellRunWorkspace(
  workspaceTarget: string | null
): NativeChatShellRunResolution | null {
  const scope = useContext(NativeChatShellRunContext)
  const platform = useMemo(() => localPlatform(), [])
  const [gitBashAvailable, setGitBashAvailable] = useState<boolean | null>(null)
  useEffect(() => {
    if (platform !== 'win32') {
      return
    }
    let cancelled = false
    void window.api.gitBash
      .isAvailable()
      .then((available) => !cancelled && setGitBashAvailable(available))
      .catch(() => !cancelled && setGitBashAvailable(false))
    return () => {
      cancelled = true
    }
  }, [platform])
  const args = useMemo(
    () => ({
      ownWorktreeId: scope?.worktreeId ?? null,
      workspaceTarget,
      localPlatform: platform,
      gitBashAvailable
    }),
    [gitBashAvailable, platform, scope?.worktreeId, workspaceTarget]
  )
  // A string, so unrelated store updates do not re-render every block in the transcript.
  const key = useAppStore((state) => signature(resolveNativeChatShellRunWorkspace(state, args)))
  // Recomputed from the live store whenever `key` says the resolution changed.
  return useMemo(
    () =>
      scope === null || key === ''
        ? null
        : resolveNativeChatShellRunWorkspace(useAppStore.getState(), args),
    [args, key, scope]
  )
}
