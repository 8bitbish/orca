import { useMemo } from 'react'
import type {
  AgentJournalRenderItem,
  AgentJournalSubmission
} from '../../../../shared/agent-session-journal-types'
import type { StructuredAgentSessionOutboxEntry } from '../../../../shared/structured-agent-session-outbox'
import { projectStructuredAgentSessionMessages } from './structured-agent-session-message-projection'

export function useStructuredAgentSessionMessages(
  items: readonly AgentJournalRenderItem[],
  outbox: readonly StructuredAgentSessionOutboxEntry[],
  submissions: readonly AgentJournalSubmission[],
  /** Sends the Queued stack shows instead, until they go out. */
  heldIds?: ReadonlySet<string>
) {
  return useMemo(
    () =>
      projectStructuredAgentSessionMessages(
        items,
        heldIds?.size ? outbox.filter((entry) => !heldIds.has(entry.clientMessageId)) : outbox,
        submissions
      ),
    [heldIds, items, outbox, submissions]
  )
}
