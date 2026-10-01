import { useEffect, useRef, useState } from 'react'
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
    const refresh = async (): Promise<void> => {
      try {
        const [repoReply, catalog] = await Promise.all([
          hostRepoCatalogRead.request(client),
          snapshotRef.current.fetch(client, hostId)
        ])
        if (cancelled) {
          return
        }
        const repoResult = hostRepoCatalogRead.interpret(repoReply)
        if (repoResult.accepted) {
          setRepos(repoResult.value)
        }
        if (catalog.kind === 'response') {
          const rows = snapshotRef.current.admit(catalog.pending)
          if (rows) {
            setWorktrees(rows)
          }
        }
      } catch {
        // Decorative: the next refresh retries.
      }
    }
    void refresh()
    const timer = setInterval(() => void refresh(), REFRESH_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [client, connected, enabled, hostId])

  return { repos, worktrees, hostReachable: connected }
}
