// When a structured session's own agent is mid-turn, for the rule behind
// `agent-session.held-send.v1`: no send is handed to the provider, or sent from a client's outbox,
// while one is, so the agent gets one message per turn instead of one folded into the turn running.

import type { AgentJournalSubmission } from './agent-session-journal-types'
import { isQueuedAgentJournalSubmission } from './agent-session-queued-submission'

/** Whether the provider holds a send it has neither opened a turn for nor refused. */
function isHandedOverAndUnanswered(
  submission: AgentJournalSubmission,
  currentFence: number | null
): boolean {
  return (
    !isQueuedAgentJournalSubmission(submission) &&
    submission.dispatchState === 'pending' &&
    (currentFence === null || submission.fence >= currentFence)
  )
}

/**
 * Whether handing over another message now would land inside a turn: one is running, or the
 * provider has a send it has not opened one for yet (Claude opens the turn on its echo, seconds
 * later). Unlike the session's Working, sends the host is still holding do not count.
 */
export function isStructuredAgentSessionTurnInProgress(
  activeTurnId: string | null,
  submissions: readonly AgentJournalSubmission[],
  currentFence: number | null
): boolean {
  return (
    activeTurnId !== null ||
    submissions.some((submission) => isHandedOverAndUnanswered(submission, currentFence))
  )
}
