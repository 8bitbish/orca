import type { AgentJournalApprovalItem } from '../../../../shared/agent-session-journal-types'

/** The approval card's props for a structured chat's pending approval prompt. */
export function structuredNativeChatApprovalCard(approvalBody: AgentJournalApprovalItem | null) {
  return approvalBody
    ? {
        title: approvalBody.title,
        ...(approvalBody.displayName ? { displayName: approvalBody.displayName } : {}),
        ...(approvalBody.description ? { description: approvalBody.description } : {}),
        ...(approvalBody.decisionReason ? { decisionReason: approvalBody.decisionReason } : {}),
        ...(approvalBody.blockedPath ? { blockedPath: approvalBody.blockedPath } : {}),
        ...(approvalBody.matchedAskRule ? { matchedAskRule: approvalBody.matchedAskRule } : {}),
        ...(approvalBody.subject ? { subject: approvalBody.subject } : {}),
        ...(approvalBody.detail ? { detail: approvalBody.detail } : {}),
        options: approvalBody.options.map((option) => ({
          label: option.label,
          send: option.id
        }))
      }
    : null
}
