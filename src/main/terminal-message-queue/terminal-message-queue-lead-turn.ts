import type { AgentStatusIpcPayload } from '../../shared/agent-status-ipc-payload'
import type { TerminalMessageQueueLead } from '../../shared/terminal-message-queue-contract'

export type LeadTurnReading = {
  lead: TerminalMessageQueueLead
  /** Names the main agent's latest turn; a new turn (even working→working) changes it. */
  turnKey: string | null
}

export const UNKNOWN_LEAD_TURN: LeadTurnReading = {
  lead: 'unknown',
  turnKey: null
}

/**
 * Reads the main agent's own turn from the host's status rows for one pane.
 *
 * Why `mainAgent` and not `state`: the combined state folds in live child work, so it stays
 * `working` while background subagents run — and Claude Code takes a new prompt as soon as the
 * main agent's turn ends. A pending question or approval anywhere in the pane is a dialog the
 * terminal is showing, so it holds delivery whoever is asking.
 */
export function readLeadTurnFromStatusRows(
  rows: readonly AgentStatusIpcPayload[]
): LeadTurnReading {
  const row = newestLiveRow(rows)
  if (!row) {
    return UNKNOWN_LEAD_TURN
  }
  const leadState = row.mainAgent?.state ?? row.state
  const turnKey = `${row.turnStartedAt ?? row.mainAgent?.stateStartedAt ?? row.stateStartedAt}\u0000${row.prompt}`
  if (row.state === 'waiting' || leadState === 'waiting') {
    return { lead: 'dialog', turnKey }
  }
  // Why: a hydrated row was never confirmed by this runtime; a restart must not hold the queue on it.
  if (leadState === 'working' && row.restoredUnconfirmed !== true) {
    return { lead: 'working', turnKey }
  }
  return { lead: 'idle', turnKey }
}

function newestLiveRow(rows: readonly AgentStatusIpcPayload[]): AgentStatusIpcPayload | null {
  let newest: AgentStatusIpcPayload | null = null
  for (const row of rows) {
    if (row.providerSessionOnly === true) {
      continue
    }
    if (!newest || row.receivedAt > newest.receivedAt) {
      newest = row
    }
  }
  return newest
}
