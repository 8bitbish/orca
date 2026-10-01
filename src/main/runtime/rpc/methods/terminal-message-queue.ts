// `terminalMessageQueue.*` — prompts sent while a terminal agent is mid-turn, held on the execution
// host and delivered in order at each turn end. Gated by TERMINAL_MESSAGE_QUEUE_RUNTIME_CAPABILITY:
// clients that predate it keep writing straight to the terminal and never see a queued reply.

import { randomUUID } from 'node:crypto'
import { defineMethod, defineStreamingMethod, type RpcContext } from '../core'
import {
  TerminalMessageQueueEdit,
  TerminalMessageQueueRemove,
  TerminalMessageQueueSubmit,
  TerminalMessageQueueTarget
} from '../../../../shared/rpc-contract/terminal-message-queue-params'
import { bindStructuredAgentSessionStream } from './structured-agent-session-status-stream'

function targetOf(params: { terminal?: string; ptyId?: string }): {
  terminal?: string
  ptyId?: string
} {
  return {
    ...(params.terminal ? { terminal: params.terminal } : {}),
    ...(params.ptyId ? { ptyId: params.ptyId } : {})
  }
}

function queueOf(ctx: RpcContext): RpcContext['runtime']['terminalMessageQueue'] {
  return ctx.runtime.terminalMessageQueue
}

export const TERMINAL_MESSAGE_QUEUE_METHODS = [
  defineMethod({
    name: 'terminalMessageQueue.submit',
    params: TerminalMessageQueueSubmit,
    handler: async (params, ctx) =>
      queueOf(ctx).submit(targetOf(params), params.session, {
        text: params.text,
        ...(params.imagePaths ? { imagePaths: params.imagePaths } : {})
      })
  }),
  defineMethod({
    name: 'terminalMessageQueue.list',
    params: TerminalMessageQueueTarget,
    handler: async (params, ctx) => ({ snapshot: queueOf(ctx).list(targetOf(params)) })
  }),
  defineMethod({
    name: 'terminalMessageQueue.remove',
    params: TerminalMessageQueueRemove,
    handler: async (params, ctx) => ({
      snapshot: queueOf(ctx).remove(targetOf(params), params.itemId)
    })
  }),
  defineMethod({
    name: 'terminalMessageQueue.edit',
    params: TerminalMessageQueueEdit,
    handler: async (params, ctx) =>
      queueOf(ctx).edit(targetOf(params), params.itemId, {
        ...(params.text !== undefined ? { text: params.text } : {}),
        ...(params.editing !== undefined ? { editing: params.editing } : {})
      })
  }),
  defineMethod({
    name: 'terminalMessageQueue.stop',
    params: TerminalMessageQueueTarget,
    handler: async (params, ctx) => queueOf(ctx).stop(targetOf(params), params.session)
  }),
  defineMethod({
    name: 'terminalMessageQueue.sendNext',
    params: TerminalMessageQueueTarget,
    handler: async (params, ctx) => queueOf(ctx).sendNext(targetOf(params))
  }),
  defineStreamingMethod({
    name: 'terminalMessageQueue.subscribe',
    params: TerminalMessageQueueTarget,
    handler: async (params, ctx, emit) => {
      const subscriptionId = `terminalMessageQueue:${ctx.connectionId ?? 'local'}:${ctx.requestId ?? randomUUID()}`
      let dispose = (): void => {}
      const stream = bindStructuredAgentSessionStream(ctx, subscriptionId, () => {
        dispose()
        emit({ type: 'end' })
      })
      if (stream.isClosed()) {
        return
      }
      dispose = queueOf(ctx).subscribe(targetOf(params), params.session, emit)
      if (stream.isClosed()) {
        dispose()
      }
    }
  })
]
