// What a project card's status pill says, folded from the same rollup the
// sidebar's worktree dot reads plus the worktree's strongest agent row. Loss of
// contact is never evidence (docs/reference/ssh-execution-boundary.md): an SSH
// project whose host is not connected reads `unverifiable`, never Idle or Done.

import type { AgentDotState } from '@/components/AgentStateDot'
import type { WorktreeStatus } from '@/lib/worktree-status'
import { translate } from '@/i18n/i18n'

export type NativeChatProjectStatus = 'working' | 'needs-you' | 'done' | 'idle' | 'unverifiable'

const NEEDS_YOU_AGENT_STATES = new Set<AgentDotState>([
  'waiting',
  'blocked',
  'permission',
  'failed'
])

export function resolveNativeChatProjectStatus(args: {
  worktreeStatus: WorktreeStatus
  /** The worktree's highest-ranked agent row state, when it has rows. */
  agentState: AgentDotState | null
  /** False when the host that owns the workspace cannot currently be asked. */
  hostReachable: boolean
}): NativeChatProjectStatus {
  const { worktreeStatus, agentState } = args
  if (!args.hostReachable) {
    return 'unverifiable'
  }
  if (
    worktreeStatus === 'permission' ||
    worktreeStatus === 'failed' ||
    (agentState !== null && NEEDS_YOU_AGENT_STATES.has(agentState))
  ) {
    return 'needs-you'
  }
  if (
    worktreeStatus === 'working' ||
    worktreeStatus === 'monitoring' ||
    agentState === 'working' ||
    agentState === 'monitoring'
  ) {
    return 'working'
  }
  if (agentState === 'unverifiable') {
    return 'unverifiable'
  }
  if (
    worktreeStatus === 'done' ||
    worktreeStatus === 'interrupted' ||
    agentState === 'done' ||
    agentState === 'interrupted'
  ) {
    return 'done'
  }
  return 'idle'
}

/** The shared agent-state glyph each status draws with. */
export function nativeChatProjectStatusDot(status: NativeChatProjectStatus): AgentDotState {
  switch (status) {
    case 'needs-you':
      return 'permission'
    case 'working':
      return 'working'
    case 'done':
      return 'done'
    case 'unverifiable':
      return 'unverifiable'
    case 'idle':
      return 'idle'
  }
}

export function nativeChatProjectStatusLabel(status: NativeChatProjectStatus): string {
  switch (status) {
    case 'needs-you':
      return translate('components.native-chat.project.status.needsYou', 'Needs you')
    case 'working':
      return translate('components.native-chat.project.status.working', 'Working')
    case 'done':
      return translate('components.native-chat.project.status.done', 'Done')
    case 'unverifiable':
      return translate('components.native-chat.project.status.unverifiable', 'Unverifiable')
    case 'idle':
      return translate('components.native-chat.project.status.idle', 'Idle')
  }
}
