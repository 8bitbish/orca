// Messages sent while Claude's turn runs wait on the host, one per turn and in order, so the SDK's
// input is never written mid-turn. Stop interrupts the turn and keeps them: the next goes out as
// the interrupted turn settles. Only a send already handed to Claude that it had not started is
// withdrawn by a Stop — under the SessionStart hook Orca installs, whose frame proves the start
// before the turn's system/init says the CLI can cancel its queue.

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { computeAgentSessionPayloadFingerprint } from '../../../shared/agent-session-mutation-envelope'
import { DISPATCH_REJECTED_CANCELLED } from '../../../shared/structured-agent-session-dispatch-rejection'
import { activeStructuredAgentSessionTurnId } from '../../../shared/structured-agent-session-live-turn'
import { projectStructuredAgentSessionStatus } from '../../../shared/structured-agent-session-projection'
import { ClaudeStructuredSessionAdapter } from '../../claude/claude-structured-session-adapter'
import {
  fakeClaude,
  PROVIDER_SESSION_ID
} from '../../claude/claude-structured-session-test-support'
import { AgentSessionRecordStore } from '../../runtime/agent-session-record-store'
import { structuredClaudeLifecycleEvent } from '../../runtime/structured-claude-runtime-adapter'
import { StructuredAgentSessionHost } from './structured-agent-session-host'
import {
  HOST_TEST_NOW as NOW,
  HOST_TEST_SESSION as SESSION,
  hostTestAttachParams,
  hostTestMessage,
  hostTestOperationId,
  resetHostTestOperationIds
} from './structured-agent-session-host-test-data'

const CALLER = { callerKey: 'client-1' }
// As Claude Code 2.1.280 advertises them on a turn's system/init frame.
const CAPABILITIES = ['interrupt_receipt_v1', 'interrupt_cancel_queued_v1', 'msg_lifecycle_v1']

let root: string
let host: StructuredAgentSessionHost
let adapter: ClaudeStructuredSessionAdapter
let store: AgentSessionRecordStore
let queued: string[]
let claude: ReturnType<typeof fakeClaude>

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'orca-claude-queued-stop-'))
  resetHostTestOperationIds()
  queued = []
  claude = fakeClaude({
    replayUuid: null,
    initProof: 'session-start',
    // What the real CLI answers: cancel_queued cancels the queue, a plain interrupt keeps it.
    routes: {
      interrupt: (params) =>
        params?.cancelQueued
          ? { still_queued: [], cancelled: queued.splice(0) }
          : { still_queued: [...queued] }
    }
  })
  const lifecycle: Promise<void>[] = []
  adapter = new ClaudeStructuredSessionAdapter({
    resolveLaunch: async () => ({
      pathToClaudeCodeExecutable: 'claude',
      options: {},
      cwd: root,
      claudeConfigDir: join(root, 'claude-home'),
      providerSessionId: PROVIDER_SESSION_ID,
      resumeLeafUuid: null,
      resumesTranscript: false,
      continuesChain: false
    }),
    onEvent: (event) => {
      const mapped = structuredClaudeLifecycleEvent(event)
      if (mapped) {
        lifecycle.push(host.handleAdapterEvent(mapped))
      }
    },
    // As the runtime wires it.
    onDispatchSettledLate: (settlement) => void host.settleLateDispatch(settlement),
    openConnection: claude.openConnection,
    readProcessStartTime: async () => 1_700_000_000_000,
    now: () => NOW
  })
  store = await AgentSessionRecordStore.open({ directory: join(root, 'store'), hostId: 'local' })
  host = new StructuredAgentSessionHost({
    store,
    adapter: Object.assign(adapter, { supportsCreate: () => true }),
    journalRoot: root,
    claimKeyId: 'key-1',
    mintSpawnToken: () => 'spawn-a',
    now: () => NOW
  })
  const params = hostTestAttachParams(null, {
    provider: 'claude',
    agent: 'claude',
    accountHome: { variable: 'CLAUDE_CONFIG_DIR', path: join(root, 'claude-home') },
    providerHandle: { kind: 'claude', sessionId: PROVIDER_SESSION_ID, leafUuid: null }
  })
  expect(await host.attach(CALLER, params)).toMatchObject({ ok: true })
  await adapter.awaitStarted(SESSION)
  await Promise.all(lifecycle)
})

afterEach(async () => {
  await adapter.closeAll()
  await host.flushAllStreamedEvents()
  await rm(root, { recursive: true, force: true })
})

function eventually(assertion: () => unknown): Promise<unknown> {
  return vi.waitFor(assertion, { timeout: 10_000 })
}

function envelope(
  method: 'agentSession.send' | 'agentSession.cancel',
  fields: Record<string, unknown>
) {
  return {
    sessionId: SESSION,
    clientOperationId: hostTestOperationId(),
    expectedRuntimeFence: store.getRecord(SESSION)!.lease.runtimeFence,
    payloadFingerprint: computeAgentSessionPayloadFingerprint({
      method,
      sessionId: SESSION,
      fields
    })
  }
}

async function send(text: string): Promise<string> {
  const body = hostTestMessage(text)
  const sent = await host.send(CALLER, { envelope: envelope('agentSession.send', { body }), body })
  if (!sent.ok) {
    throw new Error('send refused')
  }
  return sent.value.clientMessageId
}

async function dispatch(clientMessageId: string) {
  const submission = (await host.journalSnapshot(SESSION)).submissions.find(
    (entry) => entry.clientMessageId === clientMessageId
  )
  return { state: submission?.dispatchState, reason: submission?.reason }
}

async function status(): Promise<string> {
  const snapshot = await host.journalSnapshot(SESSION)
  return projectStructuredAgentSessionStatus(
    snapshot.items,
    snapshot.submissions,
    store.getRecord(SESSION)!.lease.runtimeFence
  )
}

function textOf(frame: Record<string, unknown> | undefined): string {
  return JSON.stringify(frame?.message ?? null)
}

/** Claude opens a turn for the newest message it was given: its system/init, then the echo. */
function openTurn(connection: (typeof claude.connections)[number]): void {
  connection.handlers.onMessage?.({
    type: 'system',
    subtype: 'init',
    session_id: PROVIDER_SESSION_ID,
    uuid: `init-${connection.sent.length}`,
    model: 'claude-sonnet-5',
    capabilities: CAPABILITIES
  })
  connection.handlers.onMessage?.({
    ...connection.sent.at(-1)!,
    uuid: connection.sent.at(-1)!.uuid
  })
}

function endTurn(
  connection: (typeof claude.connections)[number],
  subtype: 'success' | 'error_during_execution' = 'success'
): void {
  connection.handlers.onMessage?.({
    type: 'result',
    subtype,
    session_id: PROVIDER_SESSION_ID,
    uuid: `result-${connection.sent.length}`,
    user_message_uuid: connection.sent.at(-1)!.uuid
  })
}

async function runningTurn(): Promise<{
  connection: (typeof claude.connections)[number]
  turnId: string
}> {
  const connection = claude.connections[0]!
  const first = await send('Write a long reply.')
  await eventually(() => expect(connection.sent).toHaveLength(1))
  openTurn(connection)
  await eventually(async () => expect((await dispatch(first)).state).toBe('accepted'))
  const turnId = activeStructuredAgentSessionTurnId((await host.journalSnapshot(SESSION)).items)
  expect(turnId).not.toBeNull()
  return { connection, turnId: turnId! }
}

async function held(clientMessageId: string): Promise<boolean> {
  const submission = (await host.journalSnapshot(SESSION)).submissions.find(
    (entry) => entry.clientMessageId === clientMessageId
  )
  return submission?.dispatchState === 'pending' && submission.handedOverAt === undefined
}

/** Long enough for a delivery loop that was going to write to have written. */
async function settle(): Promise<void> {
  await host.flushStreamedEvents(SESSION)
  await new Promise((resolve) => setTimeout(resolve, 150))
}

it('holds a message sent mid-turn and hands it over as the turn ends', async () => {
  const { connection } = await runningTurn()

  const followUp = await send('And then this.')
  await settle()
  // Never written into the running turn.
  expect(connection.sent).toHaveLength(1)
  expect(await held(followUp)).toBe(true)
  expect(await status()).toBe('working')

  endTurn(connection)
  await eventually(() => expect(connection.sent).toHaveLength(2))
  expect(textOf(connection.sent[1])).toContain('And then this.')
}, 15_000)

it('delivers queued messages in order, one per turn', async () => {
  const { connection } = await runningTurn()
  const second = await send('Second.')
  const third = await send('Third.')
  await settle()
  expect(connection.sent).toHaveLength(1)

  endTurn(connection)
  await eventually(() => expect(connection.sent).toHaveLength(2))
  expect(textOf(connection.sent[1])).toContain('Second.')
  // The third waits for the turn the second opens, not merely for the second's handover.
  await settle()
  expect(connection.sent).toHaveLength(2)
  expect(await held(third)).toBe(true)

  openTurn(connection)
  await eventually(async () => expect((await dispatch(second)).state).toBe('accepted'))
  await settle()
  expect(connection.sent).toHaveLength(2)
  endTurn(connection)
  await eventually(() => expect(connection.sent).toHaveLength(3))
  expect(textOf(connection.sent[2])).toContain('Third.')
}, 15_000)

it('Stop interrupts the turn and sends the next queued message as it settles', async () => {
  const { connection, turnId } = await runningTurn()
  const next = await send('Do this instead.')
  const after = await send('Then this.')
  await settle()
  expect(connection.sent).toHaveLength(1)

  const stopped = await host.cancel(CALLER, {
    envelope: envelope('agentSession.cancel', { turnId }),
    turnId
  })
  expect(stopped).toMatchObject({ ok: true, value: { cancelled: true } })
  // Kept, not withdrawn, and still not written while the interrupted turn winds down.
  expect(await held(next)).toBe(true)
  expect(connection.sent).toHaveLength(1)

  endTurn(connection, 'error_during_execution')
  await eventually(() => expect(connection.sent).toHaveLength(2))
  expect(textOf(connection.sent[1])).toContain('Do this instead.')
  expect(await held(after)).toBe(true)
  expect((await dispatch(next)).state).toBe('pending')
}, 15_000)

it('withdraws a send Claude was handed but had not started when its turn is stopped', async () => {
  const { connection } = await runningTurn()
  endTurn(connection)
  await eventually(async () => expect(await status()).toBe('idle'))

  // Handed over at once (nothing runs), then Stopped before Claude echoes it.
  const unstarted = await send('Never mind.')
  await eventually(() => expect(connection.sent).toHaveLength(2))
  queued.push(String(connection.sent.at(-1)!.uuid))
  const stopped = await host.cancel(CALLER, {
    envelope: envelope('agentSession.cancel', {})
  })
  expect(stopped).toMatchObject({ ok: true, value: { cancelled: true } })
  await eventually(async () =>
    expect(await dispatch(unstarted)).toEqual({
      state: 'rejected',
      reason: DISPATCH_REJECTED_CANCELLED
    })
  )
  await eventually(async () => expect(await status()).toBe('idle'))
}, 15_000)
