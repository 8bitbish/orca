import { describe, expect, it } from 'vitest'
import { createClaudeMcpStatusChanges } from './claude-mcp-status-changes'

function init(servers: { name: string; status: string }[]) {
  return { type: 'system', subtype: 'init', mcp_servers: servers }
}

describe('createClaudeMcpStatusChanges', () => {
  it('says nothing for the first init or an unchanged one, even with a failed server', () => {
    const changes = createClaudeMcpStatusChanges()
    const servers = [
      { name: 'docs', status: 'connected' },
      { name: 'notes', status: 'failed' }
    ]
    expect(changes(init(servers))).toBeNull()
    expect(changes(init(servers))).toBeNull()
  })

  it('writes one muted line naming each server whose status changed', () => {
    const changes = createClaudeMcpStatusChanges()
    changes(
      init([
        { name: 'docs', status: 'connected' },
        { name: 'tracker', status: 'needs-auth' },
        { name: 'notes', status: 'connected' }
      ])
    )
    expect(
      changes(
        init([
          { name: 'docs', status: 'connected' },
          { name: 'tracker', status: 'connected' },
          { name: 'notes', status: 'failed' }
        ])
      )
    ).toEqual({ kind: 'status', text: 'MCP: tracker connected · notes failed' })
  })

  it('ignores servers still starting and ones it has not seen before', () => {
    const changes = createClaudeMcpStatusChanges()
    changes(init([{ name: 'docs', status: 'connected' }]))
    expect(
      changes(
        init([
          { name: 'docs', status: 'pending' },
          { name: 'fresh', status: 'failed' }
        ])
      )
    ).toBeNull()
    expect(changes(init([{ name: 'docs', status: 'connected' }]))).toBeNull()
    expect(changes({ type: 'system', subtype: 'init' })).toBeNull()
  })
})
