// The life of one chat Run, as a reducer. One run per block at a time: `start` is
// ignored while a run is in flight, so a double click cannot type a block twice.
// `unverifiable` is the honest end when Orca lost sight of a run it never saw finish;
// it is never collapsed into failed (docs/reference/ssh-execution-boundary.md).

import type { NativeChatShellRunInputKind } from './native-chat-shell-run-output'

export type NativeChatShellRunPhase =
  | 'idle'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'succeeded'
  | 'failed'
  | 'stopped'
  | 'unverifiable'
  | 'error'

/** Why a run ended without an exit code it can show. */
export type NativeChatShellRunProblem =
  | 'terminal-busy'
  | 'workspace-busy'
  | 'start-failed'
  | 'lost-output'
  | 'reloaded'
  | 'stop-unconfirmed'
  | 'host-unreachable'

export type NativeChatShellRunState = {
  phase: NativeChatShellRunPhase
  runId: string | null
  /** When the run's start marker arrived; the duration is measured from here. */
  startedAt: number | null
  endedAt: number | null
  exitCode: number | null
  needsInput: NativeChatShellRunInputKind | null
  output: string
  truncated: boolean
  problem: NativeChatShellRunProblem | null
  terminalHandle: string | null
  worktreeId: string | null
}

export type NativeChatShellRunEvent =
  | { type: 'start'; runId: string; worktreeId: string }
  | { type: 'attached'; terminalHandle: string }
  | { type: 'began'; at: number }
  | { type: 'output'; output: string; truncated: boolean }
  | { type: 'input'; kind: NativeChatShellRunInputKind | null }
  | { type: 'stop' }
  | { type: 'exited'; exitCode: number; at: number }
  | { type: 'lost'; problem: NativeChatShellRunProblem; at: number }
  | { type: 'refused'; problem: NativeChatShellRunProblem }

export const NATIVE_CHAT_SHELL_RUN_IDLE: NativeChatShellRunState = {
  phase: 'idle',
  runId: null,
  startedAt: null,
  endedAt: null,
  exitCode: null,
  needsInput: null,
  output: '',
  truncated: false,
  problem: null,
  terminalHandle: null,
  worktreeId: null
}

export function isNativeChatShellRunActive(phase: NativeChatShellRunPhase): boolean {
  return phase === 'starting' || phase === 'running' || phase === 'stopping'
}

export function nativeChatShellRunDurationMs(state: NativeChatShellRunState): number | null {
  return state.startedAt !== null && state.endedAt !== null
    ? Math.max(0, state.endedAt - state.startedAt)
    : null
}

export function reduceNativeChatShellRun(
  state: NativeChatShellRunState,
  event: NativeChatShellRunEvent
): NativeChatShellRunState {
  const active = isNativeChatShellRunActive(state.phase)
  switch (event.type) {
    case 'start':
      if (active) {
        return state
      }
      return {
        ...NATIVE_CHAT_SHELL_RUN_IDLE,
        phase: 'starting',
        runId: event.runId,
        worktreeId: event.worktreeId,
        terminalHandle: state.terminalHandle
      }
    case 'attached':
      return active ? { ...state, terminalHandle: event.terminalHandle } : state
    case 'began':
      return state.phase === 'starting' || (state.phase === 'stopping' && state.startedAt === null)
        ? {
            ...state,
            phase: state.phase === 'stopping' ? 'stopping' : 'running',
            startedAt: event.at
          }
        : state
    case 'output':
      return active ? { ...state, output: event.output, truncated: event.truncated } : state
    case 'input':
      return state.phase === 'running' && state.needsInput !== event.kind
        ? { ...state, needsInput: event.kind }
        : state
    case 'stop':
      return state.phase === 'starting' || state.phase === 'running'
        ? { ...state, phase: 'stopping', needsInput: null }
        : state
    case 'exited': {
      if (!active) {
        return state
      }
      const phase =
        state.phase === 'stopping' ? 'stopped' : event.exitCode === 0 ? 'succeeded' : 'failed'
      return {
        ...state,
        phase,
        exitCode: event.exitCode,
        endedAt: event.at,
        startedAt: state.startedAt ?? event.at,
        needsInput: null
      }
    }
    case 'lost':
      return active
        ? {
            ...state,
            phase: 'unverifiable',
            problem: event.problem,
            endedAt: event.at,
            needsInput: null
          }
        : state
    case 'refused':
      return active ? { ...state, phase: 'error', problem: event.problem, needsInput: null } : state
  }
}
