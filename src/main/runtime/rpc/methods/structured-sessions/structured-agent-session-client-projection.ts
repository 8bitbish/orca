// Every RPC-boundary downgrade a structured session's journal passes through for one client.

import type {
  AgentSessionHistoryResult,
  AgentSessionSubscribeEvent
} from '../../../../../shared/agent-session/agent-session-wire'
import type { RpcContext } from '../../core'
import {
  projectBackgroundTaskEvent,
  projectBackgroundTaskHistory
} from './history/structured-agent-session-background-task-capability'
import { projectQueuedImageCardHistory } from './attachments/structured-agent-session-queued-image-capability'
import {
  projectThoughtMarkerEvent,
  projectThoughtMarkerHistory
} from '../native-chat/native-chat-thought-marker-projection'
import {
  projectReceiptDeviceEvent,
  projectReceiptDeviceHistory
} from './subscriptions/structured-agent-session-receipt-devices'
import {
  projectTurnItemEvent,
  projectTurnItemHistory
} from './history/structured-agent-session-turn-item-capability'

type ProjectionReader = Pick<
  RpcContext,
  'clientKind' | 'clientCapabilities' | 'runtime' | 'caller' | 'clientId'
>

export function projectStructuredHistoryForClient(
  result: AgentSessionHistoryResult,
  ctx: ProjectionReader,
  sessionAgent: string | null
): AgentSessionHistoryResult {
  const withTurns = projectTurnItemHistory(
    projectQueuedImageCardHistory(projectBackgroundTaskHistory(result, ctx), ctx),
    ctx,
    sessionAgent
  )
  return projectReceiptDeviceHistory(projectThoughtMarkerHistory(withTurns, ctx), ctx)
}

export function projectStructuredEventForClient(
  event: AgentSessionSubscribeEvent,
  ctx: ProjectionReader,
  sessionAgent: string | null
): AgentSessionSubscribeEvent {
  const withTurns = projectTurnItemEvent(projectBackgroundTaskEvent(event, ctx), ctx, sessionAgent)
  return projectReceiptDeviceEvent(projectThoughtMarkerEvent(withTurns, ctx), ctx)
}
