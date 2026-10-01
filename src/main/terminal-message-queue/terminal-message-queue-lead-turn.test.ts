import { describe, expect, it } from 'vitest'
import type { AgentStatusIpcPayload } from '../../shared/agent-status-ipc-payload'
import { readLeadTurnFromStatusRows } from './terminal-message-queue-lead-turn'

function row(overrides: Partial<AgentStatusIpcPayload>): AgentStatusIpcPayload {
  return {
    paneKey: 'tab:leaf',
    connectionId: null,
    receivedAt: 1_000,
    stateStartedAt: 900,
    state: 'working',
    prompt: 'do the thing',
    agentType: 'claude',
    ...overrides
  }
}

describe('readLeadTurnFromStatusRows', () => {
  it('reads the main agent, not the subagent-inclusive state', () => {
    const reading = readLeadTurnFromStatusRows([
      row({ state: 'working', mainAgent: { state: 'done', stateStartedAt: 950 } })
    ])
    expect(reading.lead).toBe('idle')
  })

  it('reads a working main agent as working', () => {
    expect(
      readLeadTurnFromStatusRows([
        row({ state: 'working', mainAgent: { state: 'working', stateStartedAt: 950 } })
      ]).lead
    ).toBe('working')
  })

  it('treats any pending question or approval in the pane as a dialog', () => {
    expect(
      readLeadTurnFromStatusRows([
        row({ state: 'waiting', mainAgent: { state: 'working', stateStartedAt: 950 } })
      ]).lead
    ).toBe('dialog')
  })

  it('falls back to the combined state for agents that publish no main-agent fact', () => {
    expect(readLeadTurnFromStatusRows([row({ state: 'done' })]).lead).toBe('idle')
    expect(readLeadTurnFromStatusRows([row({ state: 'working' })]).lead).toBe('working')
  })

  it('does not hold the queue on a working row hydrated from before a restart', () => {
    expect(readLeadTurnFromStatusRows([row({ restoredUnconfirmed: true })]).lead).toBe('idle')
  })

  it('names the same turn across working and done, and a new prompt as a new turn', () => {
    const working = readLeadTurnFromStatusRows([row({ turnStartedAt: 800, state: 'working' })])
    const done = readLeadTurnFromStatusRows([row({ turnStartedAt: 800, state: 'done' })])
    const next = readLeadTurnFromStatusRows([
      row({ turnStartedAt: 800, state: 'working', prompt: 'next prompt' })
    ])
    expect(done.turnKey).toBe(working.turnKey)
    expect(next.turnKey).not.toBe(working.turnKey)
  })

  it('reads no row, or only resume-identity rows, as unknown', () => {
    expect(readLeadTurnFromStatusRows([]).lead).toBe('unknown')
    expect(readLeadTurnFromStatusRows([row({ providerSessionOnly: true })]).lead).toBe('unknown')
  })
})
