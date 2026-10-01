import { describe, expect, it } from 'vitest'
import type { AgentDotState } from '@/components/AgentStateDot'
import type { WorktreeStatus } from '@/lib/worktree-status'
import {
  nativeChatProjectStatusDot,
  resolveNativeChatProjectStatus
} from './native-chat-project-status'

function status(
  worktreeStatus: WorktreeStatus,
  agentState: AgentDotState | null,
  hostReachable = true
) {
  return resolveNativeChatProjectStatus({ worktreeStatus, agentState, hostReachable })
}

describe('resolveNativeChatProjectStatus', () => {
  it.each([
    ['permission', null, 'needs-you'],
    ['failed', null, 'needs-you'],
    ['active', 'waiting', 'needs-you'],
    ['working', 'blocked', 'needs-you'],
    ['working', 'working', 'working'],
    ['monitoring', null, 'working'],
    ['active', 'working', 'working'],
    ['done', 'done', 'done'],
    ['interrupted', null, 'done'],
    ['active', 'done', 'done'],
    ['active', null, 'idle'],
    ['inactive', null, 'idle'],
    ['inactive', 'idle', 'idle']
  ] as const)('reads a %s worktree with a %s agent as %s', (worktree, agent, expected) => {
    expect(status(worktree, agent)).toBe(expected)
  })

  it('reads a held pane whose agent went quiet as unverifiable, not idle', () => {
    expect(status('active', 'unverifiable')).toBe('unverifiable')
  })

  it('never claims idle or done for an SSH host it cannot reach', () => {
    expect(status('done', 'done', false)).toBe('unverifiable')
    expect(status('inactive', null, false)).toBe('unverifiable')
    expect(status('working', 'working', false)).toBe('unverifiable')
  })

  it('puts a question ahead of live work, as the sidebar ranks them', () => {
    expect(status('working', 'permission')).toBe('needs-you')
  })
})

describe('nativeChatProjectStatusDot', () => {
  it('draws each status with the shared agent-state glyph', () => {
    expect(nativeChatProjectStatusDot('needs-you')).toBe('permission')
    expect(nativeChatProjectStatusDot('working')).toBe('working')
    expect(nativeChatProjectStatusDot('done')).toBe('done')
    expect(nativeChatProjectStatusDot('idle')).toBe('idle')
    expect(nativeChatProjectStatusDot('unverifiable')).toBe('unverifiable')
  })
})
