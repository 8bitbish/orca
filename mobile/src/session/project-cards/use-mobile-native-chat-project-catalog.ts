import { useEffect, useMemo, useRef, useState } from 'react'
import { getCachedRepos } from '../../cache/repo-cache'
import { getCachedWorktrees } from '../../cache/worktree-cache'
import { hostRepoCatalogRead } from '../../host-screen/host-screen-operations'
import type { RpcClient } from '../../transport/rpc-client'
import type { ConnectionState } from '../../transport/types'
import type { Worktree } from '../../worktree/workspace-list-types'
import { WorktreeCatalogSnapshotClient } from '../../worktree/worktree-catalog-snapshot-client'
import type {
  MobileNativeChatProjectCatalog,
  MobileNativeChatProjectRepo
} from './mobile-native-chat-project'

const REFRESH_MS = 15_000

// The caches hold what the host screen last decoded; rows of any other shape are skipped.
function seededRepos(hostId: string): MobileNativeChatProjectRepo[] {
  return (getCachedRepos(hostId) ?? []).filter(
    (repo): repo is MobileNativeChatProjectRepo =>
      typeof repo === 'object' &&
      repo !== null &&
      'id' in repo &&
      typeof repo.id === 'string' &&
      'displayName' in repo &&
      typeof repo.displayName === 'string'
  )
}

function seededWorktrees(hostId: string): Worktree[] {
  return (getCachedWorktrees(hostId) ?? []).filter(
    (row): row is Worktree =>
      typeof row === 'object' &&
      row !== null &&
      'worktreeId' in row &&
      typeof row.worktreeId === 'string' &&
      'repoId' in row &&
      typeof row.repoId === 'string'
  )
}

/** The host's repos and workspaces for project chips and cards, refreshed while a
 *  reply shows one. Every read is best-effort: a refusal keeps the last catalog. */
export function useMobileNativeChatProjectCatalog(args: {
  client: RpcClient | null
  hostId: string
  connState: ConnectionState
  enabled: boolean
}): MobileNativeChatProjectCatalog {
  const { client, hostId, connState, enabled } = args
  const [repos, setRepos] = useState(() => seededRepos(hostId))
  const [worktrees, setWorktrees] = useState(() => seededWorktrees(hostId))
  const snapshotRef = useRef(new WorktreeCatalogSnapshotClient())
  const connected = connState === 'connected'

  useEffect(() => {
    if (!enabled || !connected || !client) {
      return
    }
    let cancelled = false
    // Independent: a refused repo list must not throw away a good workspace list, which alone
    // can name every project.
    const refreshWorktrees = async (): Promise<void> => {
      try {
        const catalog = await snapshotRef.current.fetch(client, hostId)
        if (cancelled) {
          return
        }
        if (catalog.kind === 'request_failed') {
          console.warn(`[project-cards] worktree.ps refused: ${catalog.code}`)
          return
        }
        const rows = snapshotRef.current.admit(catalog.pending)
        if (rows) {
          setWorktrees(rows)
        }
      } catch (error) {
        console.warn('[project-cards] worktree.ps failed', error)
      }
    }
    const refreshRepos = async (): Promise<void> => {
      try {
        const repoResult = hostRepoCatalogRead.interpret(await hostRepoCatalogRead.request(client))
        if (cancelled) {
          return
        }
        if (repoResult.accepted) {
          setRepos(repoResult.value)
        } else {
          console.warn('[project-cards] repo.list refused')
        }
      } catch (error) {
        console.warn('[project-cards] repo.list failed', error)
      }
    }
    const refresh = (): void => {
      void refreshWorktrees()
      void refreshRepos()
    }
    refresh()
    const timer = setInterval(refresh, REFRESH_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [client, connected, enabled, hostId])

  return useMemo(
    () => ({
      repos: withRowRepos(repos, worktrees),
      worktrees,
      hostReachable: connected,
      loaded: worktrees.length > 0
    }),
    [connected, repos, worktrees]
  )
}

/** Every repo a workspace row names, so a missing or refused repo list still resolves
 *  targets by name; the listed repo, when there is one, keeps its icon. */
function withRowRepos(
  repos: readonly MobileNativeChatProjectRepo[],
  worktrees: readonly Worktree[]
): MobileNativeChatProjectRepo[] {
  const byId = new Map(repos.map((repo) => [repo.id, repo]))
  for (const row of worktrees) {
    if (!byId.has(row.repoId) && row.repo) {
      byId.set(row.repoId, { id: row.repoId, displayName: row.repo })
    }
  }
  return [...byId.values()]
}
