import { describe, expect, it } from 'vitest'
import {
  NATIVE_CHAT_SHELL_RUN_IDLE,
  nativeChatShellRunDurationMs,
  reduceNativeChatShellRun,
  type NativeChatShellRunEvent,
  type NativeChatShellRunState
} from './native-chat-shell-run-state'

function run(
  events: NativeChatShellRunEvent[],
  from = NATIVE_CHAT_SHELL_RUN_IDLE
): NativeChatShellRunState {
  return events.reduce(reduceNativeChatShellRun, from)
}

const START: NativeChatShellRunEvent = { type: 'start', runId: 'run-0000001', worktreeId: 'wt' }

describe('reduceNativeChatShellRun', () => {
  it('goes idle -> starting -> running -> succeeded with its exit code and duration', () => {
    const state = run([
      START,
      { type: 'attached', terminalHandle: 'term_1' },
      { type: 'began', at: 1_000 },
      { type: 'output', output: 'hello', truncated: false },
      { type: 'exited', exitCode: 0, at: 2_250 }
    ])
    expect(state).toMatchObject({
      phase: 'succeeded',
      exitCode: 0,
      output: 'hello',
      terminalHandle: 'term_1'
    })
    expect(nativeChatShellRunDurationMs(state)).toBe(1_250)
  })

  it('fails on a non-zero exit', () => {
    const state = run([START, { type: 'began', at: 0 }, { type: 'exited', exitCode: 2, at: 5 }])
    expect(state.phase).toBe('failed')
    expect(state.exitCode).toBe(2)
  })

  it('ignores a second start while a run is in flight', () => {
    const running = run([START, { type: 'began', at: 0 }])
    const again = reduceNativeChatShellRun(running, { ...START, runId: 'run-0000002' })
    expect(again).toBe(running)
    const stopping = reduceNativeChatShellRun(running, { type: 'stop' })
    expect(reduceNativeChatShellRun(stopping, START)).toBe(stopping)
  })

  it('stops: whatever code the interrupted script exits with, it reads as stopped', () => {
    const state = run([
      START,
      { type: 'began', at: 0 },
      { type: 'stop' },
      { type: 'exited', exitCode: 130, at: 9 }
    ])
    expect(state.phase).toBe('stopped')
    expect(state.exitCode).toBe(130)
  })

  it('runs again from any finished state, keeping the terminal it used', () => {
    for (const end of [
      { type: 'exited', exitCode: 0, at: 1 },
      { type: 'exited', exitCode: 1, at: 1 },
      { type: 'lost', problem: 'lost-output', at: 1 }
    ] satisfies NativeChatShellRunEvent[]) {
      const finished = run([
        START,
        { type: 'attached', terminalHandle: 'term_1' },
        { type: 'began', at: 0 },
        end
      ])
      const again = reduceNativeChatShellRun(finished, { ...START, runId: 'run-0000002' })
      expect(again).toMatchObject({
        phase: 'starting',
        runId: 'run-0000002',
        output: '',
        terminalHandle: 'term_1'
      })
    }
  })

  it('marks needs input only while running, and clears it when the run ends', () => {
    const waiting = run([START, { type: 'began', at: 0 }, { type: 'input', kind: 'secret' }])
    expect(waiting.needsInput).toBe('secret')
    expect(
      reduceNativeChatShellRun(waiting, { type: 'exited', exitCode: 0, at: 1 }).needsInput
    ).toBeNull()
    expect(run([START, { type: 'input', kind: 'secret' }]).needsInput).toBeNull()
  })

  it('reads lost contact as unverifiable, never as failed', () => {
    const state = run([
      START,
      { type: 'began', at: 0 },
      { type: 'lost', problem: 'lost-output', at: 4 }
    ])
    expect(state.phase).toBe('unverifiable')
    expect(state.exitCode).toBeNull()
    expect(state.problem).toBe('lost-output')
  })

  it('reports a refused start as an error with its reason', () => {
    expect(run([START, { type: 'refused', problem: 'terminal-busy' }])).toMatchObject({
      phase: 'error',
      problem: 'terminal-busy'
    })
  })

  it('ignores events for a run that is not in flight', () => {
    expect(run([{ type: 'output', output: 'x', truncated: false }])).toBe(
      NATIVE_CHAT_SHELL_RUN_IDLE
    )
    expect(run([{ type: 'exited', exitCode: 0, at: 1 }])).toBe(NATIVE_CHAT_SHELL_RUN_IDLE)
    expect(run([{ type: 'stop' }])).toBe(NATIVE_CHAT_SHELL_RUN_IDLE)
  })
})
