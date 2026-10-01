// How long a reasoning row took, for its "Thought for Ns" line — only where the
// journal's own timestamps can say so.
//
// Both endpoints are the execution host's clock: the turn record's `startedAt`
// (provider turn-start receipt) and the reasoning row's `observedAt`, which the
// reducer pins to the row's creation. For Claude that creation is the thought's
// END: thinking blocks are journaled whole when their final frame lands (only
// prose streams). So the span is honest only for a turn's FIRST content, where
// nothing else can have run between the turn opening and the thought. Codex
// streams reasoning, so its row is created as the thought STARTS — the same
// subtraction would report latency, not thinking — and gets no duration.

import type { AgentJournalRenderItem } from '../../../../shared/agent-session-journal-types'
import { isRootAgentJournalItem } from '../../../../shared/agent-session-journal-producer'
import { readAgentJournalTurn } from '../../../../shared/agent-session-turn-record'
import type { AgentType, NativeChatMessage } from '../../../../shared/native-chat-types'

/** Agents whose reasoning rows are stamped when the thought completes. */
const COMPLETED_THOUGHT_STAMP_AGENTS: ReadonlySet<AgentType> = new Set<AgentType>(['claude'])

const NO_THOUGHT_DURATIONS: ReadonlyMap<string, number> = new Map()

/** Whole seconds per reasoning row id; rows with no honest duration are absent. */
export function nativeChatThoughtSeconds(
  agent: AgentType,
  items: readonly AgentJournalRenderItem[] | undefined
): ReadonlyMap<string, number> {
  if (!items || !COMPLETED_THOUGHT_STAMP_AGENTS.has(agent)) {
    return NO_THOUGHT_DURATIONS
  }
  const seconds = new Map<string, number>()
  let turnId: string | null = null
  let turnStartedAt: number | null = null
  let turnHasContent = false
  for (const item of items) {
    const turn = readAgentJournalTurn(item.body)
    if (turn) {
      // A revision of the open turn's record is not a new turn.
      if (turn.turnId !== turnId) {
        turnId = turn.turnId
        turnStartedAt =
          turn.startedAt !== undefined && Number.isFinite(turn.startedAt) && turn.startedAt > 0
            ? turn.startedAt
            : null
        turnHasContent = false
      }
      continue
    }
    // A subagent's rows share the journal but not the session's turn clock.
    if (!isRootAgentJournalItem(item)) {
      continue
    }
    const { body } = item
    if (body.kind === 'status') {
      continue
    }
    if (
      body.kind === 'message' &&
      body.role === 'reasoning' &&
      !turnHasContent &&
      turnStartedAt !== null &&
      item.recovered !== true &&
      item.observedAt >= turnStartedAt
    ) {
      seconds.set(item.itemId, Math.floor((item.observedAt - turnStartedAt) / 1000))
    }
    turnHasContent = true
  }
  return seconds
}

/**
 * The same honest span for a terminal-hosted session, read off its transcript:
 * the prompt record's timestamp to the thinking record's. Claude Code writes each
 * content block as its own record once the block completes, so a turn's FIRST
 * record after the prompt, when it is thinking, is stamped as that thought ends.
 * Only the transcript's own records count; an optimistic echo carries the
 * renderer's clock.
 */
export function nativeChatTranscriptThoughtSeconds(
  agent: AgentType,
  messages: readonly NativeChatMessage[]
): ReadonlyMap<string, number> {
  if (!COMPLETED_THOUGHT_STAMP_AGENTS.has(agent)) {
    return NO_THOUGHT_DURATIONS
  }
  const seconds = new Map<string, number>()
  let turnStartedAt: number | null = null
  for (const message of messages) {
    if (message.source !== 'transcript') {
      continue
    }
    if (message.role === 'user') {
      turnStartedAt = message.timestamp
      continue
    }
    if (
      message.role === 'reasoning' &&
      turnStartedAt !== null &&
      message.timestamp !== null &&
      message.timestamp >= turnStartedAt
    ) {
      seconds.set(message.id, Math.floor((message.timestamp - turnStartedAt) / 1000))
    }
    turnStartedAt = null
  }
  return seconds
}

/** Structured sessions time a thought off the journal; terminal ones off the transcript. */
export function nativeChatSessionThoughtSeconds(
  agent: AgentType,
  journalItems: readonly AgentJournalRenderItem[] | undefined,
  messages: readonly NativeChatMessage[]
): ReadonlyMap<string, number> {
  return journalItems
    ? nativeChatThoughtSeconds(agent, journalItems)
    : nativeChatTranscriptThoughtSeconds(agent, messages)
}
