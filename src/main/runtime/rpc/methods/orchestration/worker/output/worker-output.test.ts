import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { OrcaRuntimeService } from '../../../../../orca-runtime'
import { readExactWorkerOutput } from './worker-output'

function codexMessage(id: string, text: string): string {
  return JSON.stringify({
    type: 'event_msg',
    payload: { id, type: 'agent_message', message: text }
  })
}

describe('exact orchestration worker output', () => {
  let directory: string
  let transcriptA: string
  let providerSession: ReturnType<OrcaRuntimeService['getExactWorkerProviderSession']>
  let runtime: OrcaRuntimeService
  const readTerminal = vi.fn()

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'orca-worker-output-'))
    transcriptA = join(directory, 'session-a.jsonl')
    await writeFile(transcriptA, `${codexMessage('a', 'worker A only')}\n`)
    providerSession = {
      paneKey: 'tab:worker',
      processIncarnation: 'pty:incarnation-1',
      agent: 'codex',
      providerSession: {
        key: 'session_id',
        id: 'session-a',
        transcriptPath: transcriptA
      },
      observedAt: Date.now()
    }
    readTerminal.mockReset()
    readTerminal.mockResolvedValue({
      handle: 'term_worker',
      status: 'running',
      tail: ['terminal output'],
      truncated: false,
      nextCursor: '9'
    })
    runtime = {
      getExactWorkerProviderSession: vi.fn(() => providerSession),
      getTerminalProcessIncarnation: vi.fn(() => 'pty:incarnation-1'),
      getTerminalPaneKey: vi.fn(() => 'tab:worker'),
      readTerminal
    } as unknown as OrcaRuntimeService
  })

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  const read = (overrides: Partial<Parameters<typeof readExactWorkerOutput>[0]> = {}) =>
    readExactWorkerOutput({
      runtime,
      dispatchId: 'dispatch_1',
      terminalHandle: 'term_worker',
      workerState: 'ready',
      terminalStatus: 'running',
      attachedAt: '2026-07-24 00:00:00',
      ...overrides
    })

  it('redacts dispatch capabilities from a composer suggestion too', async () => {
    const capability = `dcap_${'B'.repeat(43)}`
    readTerminal.mockResolvedValue({
      handle: 'term_worker',
      status: 'running',
      tail: ['safe output'],
      suggestion: `send --dispatch-capability ${capability}`,
      truncated: false,
      nextCursor: '9'
    })
    providerSession = null

    const result = await read()

    expect(result).toMatchObject({
      source: 'terminal',
      terminal: {
        tail: ['safe output'],
        suggestion: 'send --dispatch-capability [dispatch capability redacted]'
      }
    })
    expect(JSON.stringify(result)).not.toContain(capability)
  })
})
