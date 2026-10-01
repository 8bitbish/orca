import type { AgentDotState } from '../../worktree/agent-row-display'
import type { MobileNativeChatProjectStatus } from './mobile-native-chat-project'

/** The agent-state glyph a project status draws with, as on desktop. */
export function mobileNativeChatProjectStatusDot(
  status: MobileNativeChatProjectStatus
): AgentDotState {
  switch (status) {
    case 'needs-you':
      return 'blocked'
    case 'working':
      return 'working'
    case 'done':
      return 'done'
    case 'unverifiable':
    case 'idle':
      return 'idle'
  }
}
