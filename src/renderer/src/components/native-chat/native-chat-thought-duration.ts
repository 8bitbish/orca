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
import type { AgentType } from '../../../../shared/native-chat-types'

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
