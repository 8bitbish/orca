// Pure changes to one outbox entry that a person asks for: a Retry, and editing a message the
// outbox still holds because the agent's turn is running.

import type { AgentJournalSubmission } from '../../../../shared/agent-session-journal-types'
import type { StructuredAgentSessionOutboxEntry } from '../../../../shared/structured-agent-session-outbox'

/** The outbox after a Retry of `clientMessageId`. */
export function retriedStructuredAgentSessionOutbox(
  entries: readonly StructuredAgentSessionOutboxEntry[],
  clientMessageId: string,
  submissions: readonly AgentJournalSubmission[],
  createOperationId: () => string
): StructuredAgentSessionOutboxEntry[] {
  const submission = submissions.find((candidate) => candidate.clientMessageId === clientMessageId)
  const current = entries.find((entry) => entry.clientMessageId === clientMessageId)
  // The host settled this id as rejected, and reusing it only replays that forever, so rotate the
  // id for a safe resend. Read from the message itself, which outlives a restart, or from a
  // reconciliation that settled an earlier unknown before the outbox caught up. A refusal that
  // settled the message already rotated it.
  const recordedRejection =
    current?.state === 'rejected' && current.lastFailure?.kind === 'rejected'
  if (current && (recordedRejection || submission?.dispatchState === 'rejected')) {
    return entries.map((entry) =>
      entry.clientMessageId === clientMessageId
        ? {
            ...entry,
            clientMessageId: createOperationId(),
            state: 'queued' as const,
            lastAttemptAt: null,
            retryAfterUnknownSubmittedAt: null
          }
        : entry
    )
  }
  const retryAfterUnknownSubmittedAt =
    submission?.dispatchState === 'unknown'
      ? submission.submittedAt
      : current?.state === 'unconfirmed'
        ? -1
        : null
  return entries.map((entry) =>
    entry.clientMessageId === clientMessageId
      ? { ...entry, state: 'queued' as const, retryAfterUnknownSubmittedAt }
      : entry
  )
}

/** A held message with its text replaced: one text block where its text was, images kept. */
export function editedStructuredAgentSessionOutboxEntry(
  entry: StructuredAgentSessionOutboxEntry,
  text: string
): StructuredAgentSessionOutboxEntry {
  const trimmed = text.trimEnd()
  const others = entry.body.blocks.filter((block) => block.type !== 'text')
  return {
    ...entry,
    body: {
      ...entry.body,
      blocks: [...(trimmed.trim() ? [{ type: 'text' as const, text: trimmed }] : []), ...others]
    }
  }
}
