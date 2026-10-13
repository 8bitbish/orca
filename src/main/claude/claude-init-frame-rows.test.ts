import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentSessionJournalIdentity } from '../../shared/agent-session-journal-types'
import { openAgentSessionJournal } from '../native-chat/agent-session-journal/journal-store-factory'
import { createDeferredStructuredAgentSessionEventSink } from '../native-chat/agent-session-wire/structured-agent-session-event-sink'
import { createClaudeJournalTranslator } from './claude-structured-journal-translation'
import { openTestJournalHostDatabase } from '../native-chat/agent-session-journal/journal-host-database-test-support'
import { testEventSinkLogging } from '../native-chat/agent-session-wire/structured-agent-session-logger-test-support'
import { claudeProviderHandle } from '../../shared/agent-session-provider-handle-encoding'

const IDENTITY: AgentSessionJournalIdentity = {
  sessionId: 'session-1',
  workspaceId: 'workspace-1',
  hostId: 'host-1',
  agent: 'claude',
  providerHandle: claudeProviderHandle('provider-1', 'leaf-1')
}

function init(servers: { name: string; status: string }[], n: number): Record<string, unknown> {
  return {
    type: 'system',
    subtype: 'init',
    session_id: 'provider-1',
    uuid: `9a1b2c3d-0000-4000-8000-00000000000${n}`,
    model: 'claude-test',
    tools: ['Read', 'Bash'],
    mcp_servers: servers,
    plugins: [{ name: 'kit', error: 'missing manifest' }]
  }
}

let root = ''

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'orca-claude-init-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

async function itemsFor(frames: Record<string, unknown>[]) {
  const journal = await openAgentSessionJournal({
    identity: IDENTITY,
    database: openTestJournalHostDatabase(root),
    now: () => 1_700_000_000_000,
    mintEpoch: () => 'epoch-1'
  })
  const deferred = createDeferredStructuredAgentSessionEventSink(testEventSinkLogging())
  deferred.bind({ journal, fence: 1, publish: vi.fn() })
  const translator = createClaudeJournalTranslator({ sink: deferred.sink, fallbackIdPrefix: '1' })
  for (const frame of frames) {
    translator.handle({ type: 'message', sessionId: 'orca-session', message: frame })
    await deferred.drained()
  }
  return journal.snapshot().items.map((item) => item.body)
}

describe('a Claude system:init frame', () => {
  it('writes no row each cycle, even with a failed MCP server in it', async () => {
    const servers = [
      { name: 'docs', status: 'connected' },
      { name: 'notes', status: 'failed' }
    ]
    expect(await itemsFor([init(servers, 1), init(servers, 2), init(servers, 3)])).toEqual([])
  })

  it('writes one muted line when an MCP server changes status between cycles', async () => {
    const items = await itemsFor([
      init([{ name: 'tracker', status: 'needs-auth' }], 1),
      init([{ name: 'tracker', status: 'connected' }], 2)
    ])
    expect(items).toEqual([{ kind: 'status', text: 'MCP: tracker connected' }])
  })
})
