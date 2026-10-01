import { useMemo } from 'react'
import { useAppStore } from '@/store'
import { useNow } from '@/hooks/use-now'
import { translate } from '@/i18n/i18n'
import { formatCompactDuration } from '@/lib/agent-row-decay-state'
import { formatShortTimeAgo } from '@/lib/short-time-ago'
import { lastEnteredDoneAt } from '@/components/dashboard/agent-finished-timestamp'
import { useWorktreeActivityStatus } from '@/components/sidebar/use-worktree-activity-status'
import { useWorktreeAgentRows } from '@/components/sidebar/useWorktreeAgentRows'
import { buildSummaryAgentGroups } from '@/components/sidebar/worktree-card-agent-summary'
import { getCompactAgentSecondary } from '@/components/sidebar/worktree-card-compact-agent-row'
import type { DashboardAgentRow } from '@/components/dashboard/useDashboardData'
import {
  getRepoExecutionHostId,
  getSshTargetIdForExecutionHost
} from '../../../../shared/execution-host'
import type { NativeChatProjectTarget } from './native-chat-project-target'
import {
  resolveNativeChatProjectStatus,
  type NativeChatProjectStatus
} from './native-chat-project-status'

export type NativeChatProjectLiveLine = { text: string; time: string | null }

export type NativeChatProjectLiveStatus = {
  status: NativeChatProjectStatus
  /** The strongest agent's current tool or last message; null when no agent reports. */
  liveLine: NativeChatProjectLiveLine | null
}

const CLOCK_MS = 30_000

function liveLineTime(
  row: DashboardAgentRow,
  status: NativeChatProjectStatus,
  now: number
): string | null {
  if (status === 'unverifiable') {
    // The line itself already says how long Orca has heard nothing.
    return null
  }
  const doneAt = status === 'done' || status === 'idle' ? lastEnteredDoneAt(row) : null
  if (doneAt !== null) {
    const ago = formatShortTimeAgo(doneAt, now)
    return ago === 'now'
      ? translate('components.native-chat.project.justNow', 'just now')
      : translate('components.native-chat.project.ago', '{{value0}} ago', { value0: ago })
  }
  if (status !== 'working' && status !== 'needs-you') {
    return null
  }
  const since = row.entry.turnStartedAt ?? row.entry.stateStartedAt
  if (since <= 0) {
    return null
  }
  return now - since < 60_000
    ? translate('components.native-chat.project.forUnderAMinute', 'for <1m')
    : translate('components.native-chat.project.for', 'for {{value0}}', {
        value0: formatCompactDuration(now - since)
      })
}

/** Live status for a chip or card, from the store the sidebar and `worktree ps` read. */
export function useNativeChatProjectLiveStatus(
  target: NativeChatProjectTarget | null
): NativeChatProjectLiveStatus {
  const worktreeId = target?.worktree.id ?? ''
  const worktreeStatus = useWorktreeActivityStatus(worktreeId)
  const rows = useWorktreeAgentRows(worktreeId, target !== null)
  const sshTargetId = target
    ? getSshTargetIdForExecutionHost(getRepoExecutionHostId(target.repo))
    : null
  const hostReachable = useAppStore((s) =>
    sshTargetId === null ? true : s.sshConnectionStates.get(sshTargetId)?.status === 'connected'
  )
  const now = useNow(CLOCK_MS, target !== null)

  return useMemo(() => {
    const top = buildSummaryAgentGroups(rows)[0] ?? null
    const status = resolveNativeChatProjectStatus({
      worktreeStatus,
      agentState: top?.state ?? null,
      hostReachable
    })
    if (!hostReachable) {
      return {
        status,
        liveLine: {
          text: translate(
            'components.native-chat.project.hostUnreachable',
            'SSH host not connected; status unverifiable'
          ),
          time: null
        }
      }
    }
    const row = top?.agents[0]
    const text = row ? getCompactAgentSecondary(row, now).trim() : ''
    return {
      status,
      liveLine: row && text ? { text, time: liveLineTime(row, status, now) } : null
    }
  }, [hostReachable, now, rows, worktreeStatus])
}
