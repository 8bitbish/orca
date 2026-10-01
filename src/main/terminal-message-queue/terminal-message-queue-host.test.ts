import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentStatusIpcPayload } from '../../shared/agent-status-ipc-payload'
import type { TerminalMessageQueueSession } from '../../shared/terminal-message-queue-contract'
import {
  TerminalMessageQueueHost,
  type TerminalMessageQueueRuntimePort
} from './terminal-message-queue-host'

function statusRow(state: AgentStatusIpcPayload['state']): AgentStatusIpcPayload {
  return {
    paneKey: 'tab-1:leaf-1',
    connectionId: null,
    receivedAt: Date.now(),
    stateStartedAt: 1,
    turnStartedAt: 1,
    state,
    prompt: 'p',
    agentType: 'claude',
    mainAgent: { state, stateStartedAt: 1 }
  }
}

function setup() {
  const rows = new Map<string, AgentStatusIpcPayload[]>()
  let notify: (paneKey: string) => void = () => {}
  const live = new Set(['pty-1'])
  const delivered: string[] = []
  const runtime: TerminalMessageQueueRuntimePort = {
    resolveTarget: (ref) => {
      const ptyId = ref.ptyId ?? (ref.terminal === 'term_1' ? 'pty-1' : undefined)
      return ptyId && live.has(ptyId) ? { ptyId, handle: 'term_1' } : null
    },
    paneKeyForPty: (ptyId) => (ptyId === 'pty-1' ? 'tab-1:leaf-1' : null),
    deliver: async (_target, item) => {
      delivered.push(item.text)
      return 'delivered'
    },
    interrupt: async () => true
  }
  const transcriptEnds: (() => void)[] = []
  const watchedSessions: TerminalMessageQueueSession[] = []
  const host = new TerminalMessageQueueHost(runtime, (session, onTurnEnded) => {
    watchedSessions.push(session)
    transcriptEnds.push(onTurnEnded)
    return () => {}
  })
  host.attachStatusSource({
    readPaneRows: (paneKey) => rows.get(paneKey) ?? [],
    subscribe: (listener) => {
      notify = listener
      return () => {}
    }
  })
  const setPaneState = (state: AgentStatusIpcPayload['state']): void => {
    rows.set('tab-1:leaf-1', [statusRow(state)])
    notify('tab-1:leaf-1')
  }
  return { host, delivered, setPaneState, live, transcriptEnds, watchedSessions }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('TerminalMessageQueueHost', () => {
  it('routes a status change for the pane to that terminal queue', async () => {
    const { host, delivered, setPaneState } = setup()
    setPaneState('working')
    expect(host.submit({ ptyId: 'pty-1' }, undefined, { text: 'a' }).disposition).toBe('queued')
    setPaneState('done')
    await vi.advanceTimersByTimeAsync(1_000)
    expect(delivered).toEqual(['a'])
  })

  it('reaches the same queue by PTY id and by terminal handle', () => {
    const { host, setPaneState } = setup()
    setPaneState('working')
    host.submit({ ptyId: 'pty-1' }, undefined, { text: 'from desktop' })
    host.submit({ terminal: 'term_1' }, undefined, { text: 'from phone' })
    expect(host.list({ terminal: 'term_1' }).items.map((item) => item.text)).toEqual([
      'from desktop',
      'from phone'
    ])
  })

  it('keeps an exited terminal queue readable so its items can be restored', () => {
    const { host, setPaneState, live } = setup()
    setPaneState('working')
    host.submit({ ptyId: 'pty-1' }, undefined, { text: 'a' })
    live.delete('pty-1')
    host.onPtyExit('pty-1', 'exited')
    const snapshot = host.list({ ptyId: 'pty-1' })
    expect(snapshot.terminal).toBe('exited')
    expect(snapshot.items[0]?.state).toBe('undeliverable')
  })

  it('refuses an unknown terminal', () => {
    const { host } = setup()
    expect(() => host.list({ ptyId: 'nope' })).toThrow('terminal_not_found')
  })

  it('watches the session transcript so a cancelled Claude turn releases the queue', async () => {
    const { host, delivered, setPaneState, transcriptEnds, watchedSessions } = setup()
    setPaneState('working')
    const session = { agent: 'claude', sessionId: 's-1' }
    host.submit({ ptyId: 'pty-1' }, session, { text: 'next' })
    expect(watchedSessions).toEqual([session])
    const stop = host.stop({ ptyId: 'pty-1' })
    await vi.advanceTimersByTimeAsync(0)
    transcriptEnds[0]?.()
    expect((await stop).outcome).toBe('turn-ended')
    await vi.advanceTimersByTimeAsync(1_000)
    expect(delivered).toEqual(['next'])
  })
})
