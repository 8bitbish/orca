// Runs a chat code block in its workspace's Runs terminal and follows it to its end.
// The block is typed into one reused terminal per workspace (created in the
// background, so no tab switch and no focus change), its output is read off the
// runtime's terminal stream between the run's own markers, and its exit code is the
// one the end marker carries. Only a user's click reaches `start`; nothing here
// listens to the chat, the agent, or IPC.

import type { RuntimeClientTarget } from '@/runtime/runtime-rpc-client'
import type { NativeChatShellRunBlock } from '../../../../shared/native-chat-shell-run-block'
import {
  buildNativeChatShellRunCommandLine,
  createNativeChatShellRunMarkerScanner
} from '../../../../shared/native-chat-shell-run-command'
import {
  NATIVE_CHAT_SHELL_RUN_QUIET_PROMPT_MS,
  detectNativeChatShellRunInputPrompt,
  truncateNativeChatShellRunOutput
} from '../../../../shared/native-chat-shell-run-output'
import {
  isNativeChatShellRunActive,
  type NativeChatShellRunProblem
} from '../../../../shared/native-chat-shell-run-state'
import {
  claimNativeChatShellRunWorkspace,
  dispatchNativeChatShellRun,
  getNativeChatShellRun,
  releaseNativeChatShellRunWorkspace
} from './native-chat-shell-run-store'
import type { NativeChatShellRunScreen } from './native-chat-shell-run-screen'
import type { NativeChatShellRunTransport } from './native-chat-shell-run-transport'
import { createNativeChatShellRunTerminalCache } from './native-chat-shell-run-terminal-cache'

export type NativeChatShellRunWorkspace = {
  worktreeId: string
  /** The working directory on the host that runs it. */
  path: string
  target: RuntimeClientTarget
  /** Windows only: the POSIX shell the Runs terminal is spawned as. */
  shell?: string
}

export type NativeChatShellRunEngineDeps = {
  transport: NativeChatShellRunTransport
  createScreen: () => NativeChatShellRunScreen
  now?: () => number
  randomId?: () => string
}

const OUTPUT_THROTTLE_MS = 80
const STOP_CONFIRM_MS = 10_000

type ActiveRun = {
  worktreeId: string
  target: RuntimeClientTarget
  handle: string | null
  stopPending: boolean
  screen: NativeChatShellRunScreen
  writes: Promise<void>
  unsubscribe: (() => void) | null
  timers: Set<ReturnType<typeof setTimeout>>
  outputTimer: ReturnType<typeof setTimeout> | null
  quietTimer: ReturnType<typeof setTimeout> | null
  finished: boolean
}

function defaultRunId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function createNativeChatShellRunEngine(deps: NativeChatShellRunEngineDeps) {
  const { transport } = deps
  const now = deps.now ?? Date.now
  const randomId = deps.randomId ?? defaultRunId
  const active = new Map<string, ActiveRun>()
  const terminals = createNativeChatShellRunTerminalCache()

  const settle = (key: string, run: ActiveRun): void => {
    run.finished = true
    for (const timer of [...run.timers, run.outputTimer, run.quietTimer]) {
      if (timer !== null) {
        clearTimeout(timer)
      }
    }
    run.unsubscribe?.()
    run.screen.dispose()
    releaseNativeChatShellRunWorkspace(run.worktreeId, key)
    active.delete(key)
  }

  const publishOutput = (key: string, run: ActiveRun): void => {
    run.outputTimer = null
    const { text, truncated } = truncateNativeChatShellRunOutput(run.screen.text())
    dispatchNativeChatShellRun(key, { type: 'output', output: text, truncated })
  }

  const watchInput = (key: string, run: ActiveRun): void => {
    dispatchNativeChatShellRun(key, {
      type: 'input',
      kind: detectNativeChatShellRunInputPrompt(run.screen.cursorLine(), 0)
    })
    if (run.quietTimer !== null) {
      clearTimeout(run.quietTimer)
    }
    run.quietTimer = setTimeout(() => {
      run.quietTimer = null
      dispatchNativeChatShellRun(key, {
        type: 'input',
        kind: detectNativeChatShellRunInputPrompt(
          run.screen.cursorLine(),
          NATIVE_CHAT_SHELL_RUN_QUIET_PROMPT_MS
        )
      })
    }, NATIVE_CHAT_SHELL_RUN_QUIET_PROMPT_MS)
  }

  const end = (
    key: string,
    run: ActiveRun,
    problem: NativeChatShellRunProblem | null,
    code = 0
  ) => {
    if (run.finished) {
      return
    }
    run.finished = true
    void run.writes.then(() => {
      publishOutput(key, run)
      dispatchNativeChatShellRun(
        key,
        problem === null
          ? { type: 'exited', exitCode: code, at: now() }
          : { type: 'lost', problem, at: now() }
      )
      settle(key, run)
    })
  }

  const refuse = (key: string, run: ActiveRun, problem: NativeChatShellRunProblem): void => {
    dispatchNativeChatShellRun(key, { type: 'refused', problem })
    settle(key, run)
  }

  const interrupt = (key: string, run: ActiveRun): void => {
    if (!run.handle) {
      run.stopPending = true
      return
    }
    void transport.interrupt(run.target, run.handle).catch(() => {})
    const timer = setTimeout(() => end(key, run, 'stop-unconfirmed'), STOP_CONFIRM_MS)
    run.timers.add(timer)
  }

  const attach = async (key: string, run: ActiveRun, handle: string, runId: string) => {
    run.handle = handle
    dispatchNativeChatShellRun(key, { type: 'attached', terminalHandle: handle })
    const scanner = createNativeChatShellRunMarkerScanner(runId)
    run.unsubscribe = await transport.subscribe(run.target, handle, {
      onData: (chunk) => {
        for (const event of scanner.push(chunk)) {
          if (run.finished) {
            return
          }
          if (event.type === 'start') {
            dispatchNativeChatShellRun(key, { type: 'began', at: now() })
          } else if (event.type === 'output') {
            run.writes = run.writes
              .then(() => run.screen.write(event.data))
              .then(() => {
                if (!run.finished && run.outputTimer === null) {
                  run.outputTimer = setTimeout(() => publishOutput(key, run), OUTPUT_THROTTLE_MS)
                }
                if (!run.finished) {
                  watchInput(key, run)
                }
              })
          } else {
            end(key, run, null, event.exitCode)
          }
        }
      },
      // Without its end marker the run's fate is unknown, never a failure.
      onEnd: () => end(key, run, 'lost-output')
    })
    if (run.finished) {
      run.unsubscribe()
    }
    if (run.stopPending) {
      interrupt(key, run)
    }
  }

  return {
    /** Starts `block`; false when that block or the workspace's terminal is already running one. */
    async start(
      key: string,
      block: NativeChatShellRunBlock,
      workspace: NativeChatShellRunWorkspace
    ) {
      if (isNativeChatShellRunActive(getNativeChatShellRun(key).phase)) {
        return false
      }
      if (!claimNativeChatShellRunWorkspace(workspace.worktreeId, key)) {
        return false
      }
      const runId = randomId()
      dispatchNativeChatShellRun(key, { type: 'start', runId, worktreeId: workspace.worktreeId })
      const run: ActiveRun = {
        worktreeId: workspace.worktreeId,
        target: workspace.target,
        handle: null,
        stopPending: false,
        screen: deps.createScreen(),
        writes: Promise.resolve(),
        unsubscribe: null,
        timers: new Set(),
        outputTimer: null,
        quietTimer: null,
        finished: false
      }
      active.set(key, run)
      const line = buildNativeChatShellRunCommandLine({
        script: block.script,
        interpreter: block.interpreter,
        cwd: workspace.path,
        runId
      })
      // Once the line may have reached the shell, a failure leaves the run's fate unknown.
      let typed = false
      try {
        const cached = terminals.get(workspace.target, workspace.worktreeId)
        const found = cached ? await transport.find(workspace.target, cached) : null
        if (found && found.worktreeId === workspace.worktreeId) {
          if (found.busy) {
            dispatchNativeChatShellRun(key, { type: 'attached', terminalHandle: found.handle })
            refuse(key, run, 'terminal-busy')
            return false
          }
          await attach(key, run, found.handle, runId)
          typed = true
          if (!(await transport.send(workspace.target, found.handle, line))) {
            refuse(key, run, 'start-failed')
            return false
          }
          return true
        }
        typed = true
        const created = await transport.create(workspace.target, {
          worktreeId: workspace.worktreeId,
          command: line,
          ...(workspace.shell ? { shell: workspace.shell } : {})
        })
        terminals.set(workspace.target, workspace.worktreeId, created.handle)
        await attach(key, run, created.handle, runId)
        return true
      } catch {
        if (typed && run.handle !== null) {
          end(key, run, 'lost-output')
        } else if (!run.finished) {
          refuse(key, run, 'start-failed')
        }
        return false
      }
    },
    /** Interrupts the block's run, as Ctrl+C in its terminal would. */
    stop(key: string): void {
      const run = active.get(key)
      if (!run || run.finished) {
        return
      }
      dispatchNativeChatShellRun(key, { type: 'stop' })
      interrupt(key, run)
    },
    /** Shows the Runs terminal the block last ran in. */
    async openTerminal(target: RuntimeClientTarget, handle: string): Promise<boolean> {
      try {
        await transport.focus(target, handle)
        return true
      } catch {
        return false
      }
    }
  }
}

export type NativeChatShellRunEngine = ReturnType<typeof createNativeChatShellRunEngine>
