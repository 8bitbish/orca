import { bindDeferredRpcOperation, defineRpcOperation } from '../transport/rpc-operation'
import { rpcResultVariant } from '../transport/rpc-operation-result-reader'
import { RpcIncompatibleReplyError } from '../transport/rpc-incompatible-reply-error'
import { isRpcDeliveryUnknown } from '../transport/rpc-delivery-ambiguity'
import { isLogicalClientCutoverError } from '../transport/stable-logical-rpc-client'
import type { RpcResponse } from '../transport/types'
import type {
  TerminalMessageQueueEditResult,
  TerminalMessageQueueSendNextResult,
  TerminalMessageQueueSession,
  TerminalMessageQueueSnapshot,
  TerminalMessageQueueStopResult,
  TerminalMessageQueueSubmitResult
} from '../../../src/shared/terminal-message-queue-contract'
import {
  terminalMessageQueueEditResultSchema,
  terminalMessageQueueSendNextResultSchema,
  terminalMessageQueueSnapshotReplySchema,
  terminalMessageQueueStopResultSchema,
  terminalMessageQueueSubmitResultSchema
} from './mobile-terminal-message-queue-schema'

// The host-held queue of prompts sent mid-turn (`terminalMessageQueue.*`, capability
// terminal.message-queue.v1). A host refusal throws its coded error, so a caller can tell
// "the host did nothing" from "the reply was lost" — the second must never be resent.

const submitOperation = bindDeferredRpcOperation(
  defineRpcOperation({
    name: 'terminal-message-queue.submit',
    method: 'terminalMessageQueue.submit',
    acceptance: 'require-result-or-throw',
    barrier: 'after-caller-barrier',
    read: rpcResultVariant('submit-result', terminalMessageQueueSubmitResultSchema)
  })
)

const removeOperation = bindDeferredRpcOperation(
  defineRpcOperation({
    name: 'terminal-message-queue.remove',
    method: 'terminalMessageQueue.remove',
    acceptance: 'require-result-or-throw',
    barrier: 'after-caller-barrier',
    read: rpcResultVariant('snapshot-reply', terminalMessageQueueSnapshotReplySchema)
  })
)

const editOperation = bindDeferredRpcOperation(
  defineRpcOperation({
    name: 'terminal-message-queue.edit',
    method: 'terminalMessageQueue.edit',
    acceptance: 'require-result-or-throw',
    barrier: 'after-caller-barrier',
    read: rpcResultVariant('edit-result', terminalMessageQueueEditResultSchema)
  })
)

const stopOperation = bindDeferredRpcOperation(
  defineRpcOperation({
    name: 'terminal-message-queue.stop',
    method: 'terminalMessageQueue.stop',
    acceptance: 'require-result-or-throw',
    barrier: 'after-caller-barrier',
    read: rpcResultVariant('stop-result', terminalMessageQueueStopResultSchema)
  })
)

const sendNextOperation = bindDeferredRpcOperation(
  defineRpcOperation({
    name: 'terminal-message-queue.send-next',
    method: 'terminalMessageQueue.sendNext',
    acceptance: 'require-result-or-throw',
    barrier: 'after-caller-barrier',
    read: rpcResultVariant('send-next-result', terminalMessageQueueSendNextResultSchema)
  })
)

/** What a queue call takes, named from an operation so no module names the raw port. */
export type TerminalMessageQueueRpcSender = Parameters<typeof submitOperation.request>[0]

const QUEUE_CALL_TIMEOUT_MS = 15_000
// The host waits up to 8s for the interrupt to land before it answers.
const QUEUE_STOP_TIMEOUT_MS = 20_000

export type TerminalMessageQueueCall<T> =
  | { status: 'ok'; value: T }
  /** The host answered with an error: it did nothing. */
  | { status: 'refused' }
  /** The request never left this phone. */
  | { status: 'not-sent' }
  /** The request may have reached the host; acting again could do it twice. */
  | { status: 'unknown' }

async function callQueue<T>(
  send: () => Promise<RpcResponse>,
  interpret: (response: RpcResponse) => T
): Promise<TerminalMessageQueueCall<T>> {
  let response: RpcResponse
  try {
    response = await send()
  } catch (error) {
    return isRpcDeliveryUnknown(error) || isLogicalClientCutoverError(error)
      ? { status: 'unknown' }
      : { status: 'not-sent' }
  }
  try {
    return { status: 'ok', value: interpret(response) }
  } catch (error) {
    // An unreadable success still did something on the host.
    return error instanceof RpcIncompatibleReplyError
      ? { status: 'unknown' }
      : { status: 'refused' }
  }
}

const callOptions = (timeoutMs: number) => ({ timeoutMs, budgetSpansConnect: true })

export type TerminalMessageQueueRpc = {
  submit: (input: {
    text: string
    imagePaths?: string[]
    session?: TerminalMessageQueueSession
  }) => Promise<TerminalMessageQueueCall<TerminalMessageQueueSubmitResult>>
  remove: (
    itemId: string
  ) => Promise<TerminalMessageQueueCall<{ snapshot: TerminalMessageQueueSnapshot }>>
  edit: (
    itemId: string,
    change: { text?: string; editing?: boolean }
  ) => Promise<TerminalMessageQueueCall<TerminalMessageQueueEditResult>>
  stop: (
    session?: TerminalMessageQueueSession
  ) => Promise<TerminalMessageQueueCall<TerminalMessageQueueStopResult>>
  sendNext: () => Promise<TerminalMessageQueueCall<TerminalMessageQueueSendNextResult>>
}

/** Calls for one terminal's queue, addressed by its runtime handle (the mobile naming). */
export function terminalMessageQueueRpc(
  client: TerminalMessageQueueRpcSender,
  terminal: string
): TerminalMessageQueueRpc {
  return {
    submit: (input) =>
      callQueue(
        () =>
          submitOperation.request(
            client,
            { terminal, ...input },
            callOptions(QUEUE_CALL_TIMEOUT_MS)
          ),
        submitOperation.interpret
      ),
    remove: (itemId) =>
      callQueue(
        () =>
          removeOperation.request(client, { terminal, itemId }, callOptions(QUEUE_CALL_TIMEOUT_MS)),
        removeOperation.interpret
      ),
    edit: (itemId, change) =>
      callQueue(
        () =>
          editOperation.request(
            client,
            { terminal, itemId, ...change },
            callOptions(QUEUE_CALL_TIMEOUT_MS)
          ),
        editOperation.interpret
      ),
    stop: (session) =>
      callQueue(
        () =>
          stopOperation.request(
            client,
            { terminal, ...(session ? { session } : {}) },
            callOptions(QUEUE_STOP_TIMEOUT_MS)
          ),
        stopOperation.interpret
      ),
    sendNext: () =>
      callQueue(
        () => sendNextOperation.request(client, { terminal }, callOptions(QUEUE_CALL_TIMEOUT_MS)),
        sendNextOperation.interpret
      )
  }
}
