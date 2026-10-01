// Transitional: remove once no supported client lacks AGENT_SESSION_THOUGHT_MARKER_CAPABILITY.
//
// A reasoning row with no text reaches a client that predates it as a message with
// nothing to draw, which older mobile builds paint as a blank gap. So the host leaves
// those rows out at the RPC boundary only; the journal, the transcript reader and
// every in-process reader keep them. Dropping is safe on both surfaces: clients merge
// messages and journal items by id, and journal paging runs on page cursors, never
// on item contiguity.

import type { AgentJournalRenderItem } from '../../../../shared/agent-session-journal-types'
import type {
  AgentSessionHistoryPage,
  AgentSessionHistoryResult,
  AgentSessionSubscribeEvent
} from '../../../../shared/agent-session-wire'
import type { NativeChatMessage } from '../../../../shared/native-chat-types'
import {
  isAgentJournalThoughtMarkerBody,
  isNativeChatThoughtMarker
} from '../../../../shared/native-chat-thought-marker'
import { AGENT_SESSION_THOUGHT_MARKER_CAPABILITY } from '../../../../shared/protocol-version'
import type { RpcContext } from '../core'

type ThoughtMarkerReader = Pick<RpcContext, 'clientKind' | 'clientCapabilities'>

function readsThoughtMarkers(ctx: ThoughtMarkerReader): boolean {
  // An in-process caller is this build; only a negotiated client can predate the marker.
  return (
    ctx.clientKind === undefined ||
    ctx.clientCapabilities?.includes(AGENT_SESSION_THOUGHT_MARKER_CAPABILITY) === true
  )
}

export function projectThoughtMarkerMessages(
  messages: NativeChatMessage[],
  ctx: ThoughtMarkerReader
): NativeChatMessage[] {
  if (readsThoughtMarkers(ctx) || !messages.some(isNativeChatThoughtMarker)) {
    return messages
  }
  return messages.filter((message) => !isNativeChatThoughtMarker(message))
}

function projectItems(items: AgentJournalRenderItem[]): AgentJournalRenderItem[] {
  if (!items.some((item) => isAgentJournalThoughtMarkerBody(item.body))) {
    return items
  }
  return items.filter((item) => !isAgentJournalThoughtMarkerBody(item.body))
}

function projectPage(page: AgentSessionHistoryPage): AgentSessionHistoryPage {
  const items = projectItems(page.items)
  return items === page.items ? page : { ...page, items }
}

export function projectThoughtMarkerHistory(
  result: AgentSessionHistoryResult,
  ctx: ThoughtMarkerReader
): AgentSessionHistoryResult {
  if (readsThoughtMarkers(ctx)) {
    return result
  }
  const page = projectPage(result.page)
  return page === result.page ? result : { ...result, page }
}

export function projectThoughtMarkerEvent(
  event: AgentSessionSubscribeEvent,
  ctx: ThoughtMarkerReader
): AgentSessionSubscribeEvent {
  if (readsThoughtMarkers(ctx)) {
    return event
  }
  if (event.type === 'batch') {
    const items = projectItems(event.batch.items)
    return items === event.batch.items ? event : { ...event, batch: { ...event.batch, items } }
  }
  if (event.type === 'snapshot' || event.type === 'reset') {
    const page = projectPage(event.page)
    return page === event.page ? event : { ...event, page }
  }
  return event
}
