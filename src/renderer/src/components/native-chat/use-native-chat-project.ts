import { useMemo } from 'react'
import { useAppStore } from '@/store'
import { activateWorktreeFromSidebar } from '@/lib/sidebar-worktree-activation'
import { getRepoExecutionHostId } from '../../../../shared/execution-host'
import {
  nativeChatProjectWorkspaceLabel,
  resolveNativeChatProjectTarget,
  type NativeChatProjectTarget
} from './native-chat-project-target'
import {
  resolveNativeChatProjectIcon,
  type NativeChatProjectIconSource
} from './native-chat-project-icon'
import { useNativeChatProjectAppIcon } from './use-native-chat-project-app-icon'

export type NativeChatProject = {
  target: NativeChatProjectTarget
  name: string
  /** Null for the project's main workspace. */
  workspace: string | null
  icon: NativeChatProjectIconSource
}

/** The workspace a chip or card names, or null when it names none Orca knows. */
export function useNativeChatProject(
  target: string,
  payloadIcon?: string
): NativeChatProject | null {
  const repos = useAppStore((s) => s.repos)
  const worktreesByRepo = useAppStore((s) => s.worktreesByRepo)
  const resolved = useMemo(
    () => resolveNativeChatProjectTarget(target, repos, worktreesByRepo),
    [repos, target, worktreesByRepo]
  )
  const appIconSrc = useNativeChatProjectAppIcon(payloadIcon ? null : (resolved?.repo ?? null))
  return useMemo(() => {
    if (!resolved) {
      return null
    }
    return {
      target: resolved,
      name: resolved.repo.displayName,
      workspace: nativeChatProjectWorkspaceLabel(resolved),
      icon: resolveNativeChatProjectIcon({
        payloadIcon,
        appIconSrc,
        repoName: resolved.repo.displayName
      })
    }
  }, [appIconSrc, payloadIcon, resolved])
}

/** Focus the workspace the same way a sidebar click does. */
export function focusNativeChatProject(target: NativeChatProjectTarget): void {
  void activateWorktreeFromSidebar(
    target.worktree.id,
    target.worktree.hostId ?? getRepoExecutionHostId(target.repo)
  )
}
