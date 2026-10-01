import type { RuntimeRpcResponse } from '../../../shared/runtime-rpc-envelope'
import { TERMINAL_MESSAGE_QUEUE_RUNTIME_CAPABILITY } from '../../../shared/terminal-message-queue-capability'
import type {
  TerminalMessageQueueEditResult,
  TerminalMessageQueueEvent,
  TerminalMessageQueueSendNextResult,
  TerminalMessageQueueSession,
  TerminalMessageQueueSnapshot,
  TerminalMessageQueueStopResult,
  TerminalMessageQueueSubmitResult
} from '../../../shared/terminal-message-queue-contract'
import { getRuntimeEnvironmentRevision } from './runtime-environment-revision'
import {
  callRuntimeRpc,
  runtimeEnvironmentSupportsCapability,
  type RuntimeClientTarget
} from './runtime-rpc-client'
import {
  ensureLocalRuntimeCapabilities,
  readLocalRuntimeCapabilitiesOrUnknown
} from './local-runtime-capabilities'
import {
  getRemoteRuntimePtyEnvironmentId,
  getRemoteRuntimeTerminalHandle
} from './runtime-terminal-stream'

/** Where a pane's queue lives: the runtime that owns its PTY, named the way that runtime knows it. */
export type TerminalMessageQueueClientTarget = {
  runtime: RuntimeClientTarget
  ref: { terminal: string } | { ptyId: string }
}

export function terminalMessageQueueTargetForPty(ptyId: string): TerminalMessageQueueClientTarget {
  const environmentId = getRemoteRuntimePtyEnvironmentId(ptyId)
  const handle = getRemoteRuntimeTerminalHandle(ptyId)
  if (environmentId && handle) {
    return { runtime: { kind: 'environment', environmentId }, ref: { terminal: handle } }
  }
  // Local and SSH panes: this desktop's main process owns the PTY and the status store.
  return { runtime: { kind: 'local' }, ref: { ptyId } }
}

/** False for a host that predates the queue or could not be probed; the caller sends directly. */
export async function supportsTerminalMessageQueue(
  target: TerminalMessageQueueClientTarget
): Promise<boolean> {
  try {
    if (target.runtime.kind === 'local') {
      const known = readLocalRuntimeCapabilitiesOrUnknown()
      const capabilities = known ?? (await ensureLocalRuntimeCapabilities())
      return capabilities?.includes(TERMINAL_MESSAGE_QUEUE_RUNTIME_CAPABILITY) === true
    }
    return await runtimeEnvironmentSupportsCapability(
      target.runtime.environmentId,
      TERMINAL_MESSAGE_QUEUE_RUNTIME_CAPABILITY
    )
  } catch {
    return false
  }
}

function call<TResult>(
  target: TerminalMessageQueueClientTarget,
  method: string,
  params: Record<string, unknown>
): Promise<TResult> {
  return callRuntimeRpc<TResult>(target.runtime, method, { ...target.ref, ...params })
}

export const terminalMessageQueueClient = {
  submit: (
    target: TerminalMessageQueueClientTarget,
    input: { text: string; imagePaths?: string[]; session?: TerminalMessageQueueSession }
  ) => call<TerminalMessageQueueSubmitResult>(target, 'terminalMessageQueue.submit', input),
  remove: (target: TerminalMessageQueueClientTarget, itemId: string) =>
    call<{ snapshot: TerminalMessageQueueSnapshot }>(target, 'terminalMessageQueue.remove', {
      itemId
    }),
  edit: (
    target: TerminalMessageQueueClientTarget,
    itemId: string,
    change: { text?: string; editing?: boolean }
  ) =>
    call<TerminalMessageQueueEditResult>(target, 'terminalMessageQueue.edit', {
      itemId,
      ...change
    }),
  stop: (target: TerminalMessageQueueClientTarget, session?: TerminalMessageQueueSession) =>
    call<TerminalMessageQueueStopResult>(
      target,
      'terminalMessageQueue.stop',
      session ? { session } : {}
    ),
  sendNext: (target: TerminalMessageQueueClientTarget) =>
    call<TerminalMessageQueueSendNextResult>(target, 'terminalMessageQueue.sendNext', {})
}

export function subscribeTerminalMessageQueue(
  target: TerminalMessageQueueClientTarget,
  session: TerminalMessageQueueSession | undefined,
  handlers: {
    onEvent: (event: TerminalMessageQueueEvent) => void
    onError: (error: unknown) => void
    onClose: () => void
  }
): Promise<{ unsubscribe: () => void }> {
  const method = 'terminalMessageQueue.subscribe'
  const params = { ...target.ref, ...(session ? { session } : {}) }
  const onResponse = (response: RuntimeRpcResponse<unknown>): void => {
    if (!response.ok) {
      handlers.onError(response.error)
      return
    }
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the host's subscribe stream emits only TerminalMessageQueueEvent frames.
    const event = response.result as TerminalMessageQueueEvent
    handlers.onEvent(event)
    if (event.type === 'end') {
      handlers.onClose()
    }
  }
  if (target.runtime.kind === 'local') {
    return window.api.runtime.subscribe({ method, params }, onResponse)
  }
  return window.api.runtimeEnvironments.subscribe(
    {
      selector: target.runtime.environmentId,
      method,
      params,
      timeoutMs: 15_000,
      expectedEnvironmentPairingRevision: getRuntimeEnvironmentRevision(
        target.runtime.environmentId
      )
    },
    { onResponse, onError: handlers.onError, onClose: handlers.onClose }
  )
}
