// Claude re-sends `system:init` every request cycle with each MCP server's status. The frame itself
// draws no row; a server whose settled status changed since the last init earns one muted line.

import type { AgentJournalStatusItem } from '../../shared/agent-session-journal-types'
import { claudeRecord, claudeText } from './claude-structured-item-translation'

export const CLAUDE_INIT_FRAME_KIND = 'message:system:init'

const STATUS_WORDS: Readonly<Record<string, string>> = {
  connected: 'connected',
  'needs-auth': 'needs sign-in',
  failed: 'failed',
  disabled: 'disabled'
}

function mcpStatuses(payload: unknown): Map<string, string> {
  const statuses = new Map<string, string>()
  const servers = claudeRecord(payload)?.mcp_servers
  for (const server of Array.isArray(servers) ? servers : []) {
    const name = claudeText(claudeRecord(server)?.name)
    const status = claudeText(claudeRecord(server)?.status)
    // `pending` is a server still starting; only a settled status is a change worth a line.
    if (name && status && status !== 'pending') {
      statuses.set(name, status)
    }
  }
  return statuses
}

/** Per session: the first init sets the baseline silently; later ones return a row only on change. */
export function createClaudeMcpStatusChanges(): (
  payload: unknown
) => AgentJournalStatusItem | null {
  let last: Map<string, string> | null = null
  return (payload) => {
    const next = mcpStatuses(payload)
    const previous = last
    last = new Map([...(previous ?? []), ...next])
    if (!previous) {
      return null
    }
    const changes = [...next].flatMap(([name, status]) => {
      const before = previous.get(name)
      return before !== undefined && before !== status
        ? [`${name} ${STATUS_WORDS[status] ?? status}`]
        : []
    })
    return changes.length > 0
      ? {
          kind: 'status',
          text: `MCP: ${changes.join(' · ')}`
        }
      : null
  }
}
