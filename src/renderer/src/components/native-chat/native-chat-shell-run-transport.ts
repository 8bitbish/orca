// The chat Run button's only way to touch a terminal: the runtime's `terminal.*`
// methods, the same ones `orca terminal create/send/read` call. The runtime that owns
// the workspace executes them — the local one for local and SSH workspaces, the
// paired host for a remote environment — so a run never lands on the wrong machine.

import type { RuntimeRpcResponse } from '../../../../shared/runtime-rpc-envelope'
import type {
  RuntimeTerminalCreate,
  RuntimeTerminalSend,
  RuntimeTerminalShow
} from '../../../../shared/runtime-terminal-contracts'
import { callRuntimeRpc, type RuntimeClientTarget } from '@/runtime/runtime-rpc-client'
import { getRuntimeEnvironmentRevision } from '@/runtime/runtime-environment-revision'
import { toRuntimeWorktreeSelector } from '@/runtime/runtime-worktree-selector'
import { createBrowserUuid } from '@/lib/browser-uuid'

export const NATIVE_CHAT_SHELL_RUN_TERMINAL_TITLE = 'Runs'
const RPC_TIMEOUT_MS = 15_000
const CLIENT = { id: 'orca-desktop', type: 'desktop' as const }

export type NativeChatShellRunTerminal = {
  handle: string
  worktreeId: string
  /** The host saw a process under the shell, so typing would feed it, not the shell. */
  busy: boolean
}

export type NativeChatShellRunStream = {
  onData: (data: string) => void
  /** The stream closed: the terminal exited, or Orca lost the host. */
  onEnd: () => void
}

export type NativeChatShellRunTransport = {
  /** The terminal behind `handle`, or null when the host no longer has it. */
  find: (target: RuntimeClientTarget, handle: string) => Promise<NativeChatShellRunTerminal | null>
  /** Opens the Runs tab in the background and types `command` once its shell is ready. */
  create: (
    target: RuntimeClientTarget,
    args: { worktreeId: string; command: string; shell?: string }
  ) => Promise<{ handle: string; hostPlatform?: NodeJS.Platform }>
  subscribe: (
    target: RuntimeClientTarget,
    handle: string,
    stream: NativeChatShellRunStream
  ) => Promise<() => void>
  send: (target: RuntimeClientTarget, handle: string, text: string) => Promise<boolean>
  interrupt: (target: RuntimeClientTarget, handle: string) => Promise<void>
  focus: (target: RuntimeClientTarget, handle: string) => Promise<void>
}

type TerminalStreamFrame = { type?: unknown; chunk?: unknown }

function isStreamFrame(value: unknown): value is TerminalStreamFrame {
  return typeof value === 'object' && value !== null
}

async function find(
  target: RuntimeClientTarget,
  handle: string
): Promise<NativeChatShellRunTerminal | null> {
  let terminal: RuntimeTerminalShow
  try {
    ;({ terminal } = await callRuntimeRpc<{ terminal: RuntimeTerminalShow }>(
      target,
      'terminal.show',
      { terminal: handle },
      { timeoutMs: RPC_TIMEOUT_MS }
    ))
  } catch {
    return null
  }
  if (!terminal.connected || !terminal.writable) {
    return null
  }
  let busy = false
  try {
    const { process } = await callRuntimeRpc<{ process: { hasChildProcesses?: boolean } }>(
      target,
      'terminal.inspectProcess',
      { terminal: handle },
      { timeoutMs: RPC_TIMEOUT_MS }
    )
    busy = process.hasChildProcesses === true
  } catch {
    // An unanswered probe is no evidence of a process; the run lock still guards our own runs.
  }
  return { handle: terminal.handle, worktreeId: terminal.worktreeId, busy }
}

async function create(
  target: RuntimeClientTarget,
  args: { worktreeId: string; command: string; shell?: string }
): Promise<{ handle: string; hostPlatform?: NodeJS.Platform }> {
  const { terminal } = await callRuntimeRpc<{ terminal: RuntimeTerminalCreate }>(
    target,
    'terminal.create',
    {
      worktree: toRuntimeWorktreeSelector(args.worktreeId),
      command: args.command,
      // Typed only once the shell's line editor is up, so nothing is lost to startup.
      startupCommandDelivery: 'shell-ready',
      title: NATIVE_CHAT_SHELL_RUN_TERMINAL_TITLE,
      presentation: 'background',
      ...(args.shell ? { shell: args.shell } : {})
    },
    { timeoutMs: RPC_TIMEOUT_MS }
  )
  return {
    handle: terminal.handle,
    ...(terminal.hostPlatform ? { hostPlatform: terminal.hostPlatform } : {})
  }
}

async function subscribe(
  target: RuntimeClientTarget,
  handle: string,
  stream: NativeChatShellRunStream
): Promise<() => void> {
  let ended = false
  const end = (): void => {
    if (!ended) {
      ended = true
      stream.onEnd()
    }
  }
  const onResponse = (response: RuntimeRpcResponse<unknown>): void => {
    if (!response.ok) {
      end()
      return
    }
    const frame = response.result
    if (!isStreamFrame(frame)) {
      return
    }
    if (frame.type === 'data' && typeof frame.chunk === 'string') {
      stream.onData(frame.chunk)
    } else if (frame.type === 'end') {
      end()
    }
  }
  // A client id of its own keeps this watcher from replacing any other subscriber's slot;
  // no viewport, so it never resizes the PTY.
  const params = {
    terminal: handle,
    client: { id: `orca-chat-run-${createBrowserUuid()}`, type: 'desktop' }
  }
  const subscription =
    target.kind === 'local'
      ? await window.api.runtime.subscribe({ method: 'terminal.subscribe', params }, onResponse)
      : await window.api.runtimeEnvironments.subscribe(
          {
            selector: target.environmentId,
            method: 'terminal.subscribe',
            params,
            timeoutMs: RPC_TIMEOUT_MS,
            expectedEnvironmentPairingRevision: getRuntimeEnvironmentRevision(target.environmentId)
          },
          { onResponse, onError: end, onClose: end }
        )
  return () => {
    ended = true
    subscription.unsubscribe()
  }
}

async function send(target: RuntimeClientTarget, handle: string, text: string): Promise<boolean> {
  const { send: result } = await callRuntimeRpc<{ send: RuntimeTerminalSend }>(
    target,
    'terminal.send',
    { terminal: handle, text, enter: true, client: CLIENT },
    { timeoutMs: RPC_TIMEOUT_MS }
  )
  return result.accepted
}

async function interrupt(target: RuntimeClientTarget, handle: string): Promise<void> {
  await callRuntimeRpc(
    target,
    'terminal.send',
    { terminal: handle, interrupt: true, client: CLIENT },
    { timeoutMs: RPC_TIMEOUT_MS }
  )
}

async function focus(target: RuntimeClientTarget, handle: string): Promise<void> {
  await callRuntimeRpc(target, 'terminal.focus', { terminal: handle, navigation: 'host' })
}

export const nativeChatShellRunRuntimeTransport: NativeChatShellRunTransport = {
  find,
  create,
  subscribe,
  send,
  interrupt,
  focus
}
