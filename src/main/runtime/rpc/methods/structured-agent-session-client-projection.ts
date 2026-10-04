// Every RPC-boundary downgrade a structured session's journal passes through for one client.

import type {
  AgentSessionHistoryResult,
  AgentSessionSubscribeEvent
} from '../../../../shared/agent-session-wire'
import type { RpcContext } from '../core'
import {
  projectBackgroundTaskEvent,
  projectBackgroundTaskHistory
} from './structured-agent-session-background-task-capability'
import {
  projectThoughtMarkerEvent,
  projectThoughtMarkerHistory
} from './native-chat-thought-marker-projection'
import {
  projectTurnItemEvent,
  projectTurnItemHistory
} from './structured-agent-session-turn-item-capability'

type ProjectionReader = Pick<RpcContext, 'clientKind' | 'clientCapabilities'>

export function projectStructuredHistoryForClient(
  result: AgentSessionHistoryResult,
  ctx: ProjectionReader,
  sessionAgent: string | null
): AgentSessionHistoryResult {
  const withTurns = projectTurnItemHistory(
    projectBackgroundTaskHistory(result, ctx),
    ctx,
    sessionAgent
  )
  return projectThoughtMarkerHistory(withTurns, ctx)
}

export function projectStructuredEventForClient(
  event: AgentSessionSubscribeEvent,
  ctx: ProjectionReader,
  sessionAgent: string | null
): AgentSessionSubscribeEvent {
  const withTurns = projectTurnItemEvent(projectBackgroundTaskEvent(event, ctx), ctx, sessionAgent)
  return projectThoughtMarkerEvent(withTurns, ctx)
}
