// A project chip or card's workspace on mobile: the shared target resolver over the
// host's repo and worktree catalog, plus a status folded from the row the host
// screen shows. Losing the host is never evidence the work stopped
// (docs/reference/ssh-execution-boundary.md), so a card then reads `unverifiable`.

import type { RuntimeWorktreeAgentRow } from '../../../../src/shared/runtime-types'
import {
  nativeChatProjectWorkspaceLabel,
  resolveNativeChatProjectTarget,
  type NativeChatProjectRepoRow,
  type NativeChatProjectWorktreeRow
} from '../../../../src/shared/native-chat-project-target'
import type { MobileHostRepoIcon } from '../../host-screen/host-screen-reply-schema'
import type { Worktree } from '../../worktree/workspace-list-types'
import {
  agentDisplayLabel,
  agentDotState,
  agentRowTimeAt,
  formatTimeAgo,
  type AgentDotState
} from '../../worktree/agent-row-display'

export type MobileNativeChatProjectRepo = NativeChatProjectRepoRow & {
  repoIcon?: MobileHostRepoIcon
  badgeColor?: string
}

type ProjectWorktreeRow = NativeChatProjectWorktreeRow & { row: Worktree }

export type MobileNativeChatProjectCatalog = {
  repos: readonly MobileNativeChatProjectRepo[]
  worktrees: readonly Worktree[]
  /** False while the host cannot be asked; the catalog is then the last one it gave. */
  hostReachable: boolean
  /** False until the host has listed its workspaces; until then no target can be judged unknown. */
  loaded: boolean
}

export type MobileNativeChatProjectStatus =
  | 'working'
  | 'needs-you'
  | 'done'
  | 'idle'
  | 'unverifiable'

export type MobileNativeChatProject = {
  worktreeId: string
  name: string
  workspace: string | null
  repo: MobileNativeChatProjectRepo
  status: MobileNativeChatProjectStatus
  liveLine: { text: string; time: string | null } | null
}

const NEEDS_YOU = new Set<AgentDotState>(['blocked', 'waiting', 'failed'])
const AGENT_RANK: Record<AgentDotState, number> = {
  failed: 0,
  blocked: 0,
  waiting: 0,
  working: 1,
  monitoring: 1,
  done: 2,
  interrupted: 2,
  // An end the host could not prove ranks with the other finished states.
  unconfirmed: 2,
  idle: 3
}

function topAgent(
  agents: readonly RuntimeWorktreeAgentRow[],
  now: number
): { row: RuntimeWorktreeAgentRow; state: AgentDotState } | null {
  let best: { row: RuntimeWorktreeAgentRow; state: AgentDotState } | null = null
  for (const row of agents) {
    const state = agentDotState(row, now)
    if (best === null || AGENT_RANK[state] < AGENT_RANK[best.state]) {
      best = { row, state }
    }
  }
  return best
}

export function resolveMobileNativeChatProjectStatus(
  row: Pick<Worktree, 'status'>,
  agentState: AgentDotState | null,
  hostReachable: boolean
): MobileNativeChatProjectStatus {
  if (!hostReachable) {
    return 'unverifiable'
  }
  if (row.status === 'permission' || (agentState !== null && NEEDS_YOU.has(agentState))) {
    return 'needs-you'
  }
  if (row.status === 'working' || agentState === 'working' || agentState === 'monitoring') {
    return 'working'
  }
  if (row.status === 'done' || agentState === 'done' || agentState === 'interrupted') {
    return 'done'
  }
  return 'idle'
}

export const MOBILE_NATIVE_CHAT_PROJECT_STATUS_LABEL: Record<
  MobileNativeChatProjectStatus,
  string
> = {
  'needs-you': 'Needs you',
  working: 'Working',
  done: 'Done',
  idle: 'Idle',
  unverifiable: 'Unverifiable'
}

function liveLine(
  top: { row: RuntimeWorktreeAgentRow } | null,
  status: MobileNativeChatProjectStatus,
  now: number
): MobileNativeChatProject['liveLine'] {
  if (status === 'unverifiable') {
    return { text: 'Host not connected; status unverifiable', time: null }
  }
  if (!top) {
    return null
  }
  const text = agentDisplayLabel(top.row, now).replace(/\s+/g, ' ').trim()
  if (!text) {
    return null
  }
  const ago = formatTimeAgo(agentRowTimeAt(top.row), now)
  const time =
    status === 'working' || status === 'needs-you'
      ? `for ${ago === 'just now' ? '<1m' : ago}`
      : ago === 'just now'
        ? 'just now'
        : `${ago} ago`
  return { text, time }
}

export function resolveMobileNativeChatProject(
  target: string,
  catalog: MobileNativeChatProjectCatalog,
  now: number
): MobileNativeChatProject | null {
  const worktreesByRepo: Record<string, ProjectWorktreeRow[]> = {}
  for (const row of catalog.worktrees) {
    const projected: ProjectWorktreeRow = {
      id: row.worktreeId,
      repoId: row.repoId,
      displayName: row.displayName,
      branch: row.branch,
      path: row.path,
      isMainWorktree: row.isMainWorktree,
      isArchived: row.isArchived,
      row
    }
    ;(worktreesByRepo[row.repoId] ??= []).push(projected)
  }
  const resolved = resolveNativeChatProjectTarget(target, catalog.repos, worktreesByRepo)
  if (!resolved) {
    return null
  }
  const { row } = resolved.worktree
  const top = topAgent(row.agents ?? [], now)
  const status = resolveMobileNativeChatProjectStatus(
    row,
    top?.state ?? null,
    catalog.hostReachable
  )
  return {
    worktreeId: row.worktreeId,
    name: resolved.repo.displayName,
    workspace: nativeChatProjectWorkspaceLabel(resolved),
    repo: resolved.repo,
    status,
    liveLine: liveLine(top, status, now)
  }
}

/** A card or chip whose workspace cannot be looked up yet: named as the reply names it,
 *  with nothing to open and a status nobody has verified. */
export function pendingMobileNativeChatProject(target: string): MobileNativeChatProject {
  const slash = target.indexOf('/')
  const name = (slash === -1 ? target : target.slice(0, slash)).trim() || target
  const workspace = slash === -1 ? null : target.slice(slash + 1).trim() || null
  return {
    worktreeId: '',
    name,
    workspace,
    repo: { id: '', displayName: name },
    status: 'unverifiable',
    liveLine: { text: "Waiting for the desktop's workspace list", time: null }
  }
}
