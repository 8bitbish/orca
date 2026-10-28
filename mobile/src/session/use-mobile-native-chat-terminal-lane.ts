import type { AgentStatusEntry } from '../../../src/shared/agent-status-types'
import type { RpcClient } from '../transport/rpc-client'
import type { StructuredAgentSessionHostSupport } from './mobile-structured-agent-session-host-support'
import { useMobileNativeChatAskDismiss } from './native-chat/input/use-mobile-native-chat-ask-dismiss'
import {
  useMobileNativeChatPrompts,
  type MobileNativeChatPrompts
} from './native-chat/input/use-mobile-native-chat-prompts'
import type { MobileStructuredAskSession } from './use-mobile-structured-async-question'
import type { MobileNativeChatSession } from './use-mobile-native-chat-session'
import { useMobileNativeChatTerminalQueue } from './use-mobile-native-chat-terminal-queue'
import type { MobileNativeChatController } from './mobile-native-chat-controller-contract'

type TerminalQueueArgs = Parameters<typeof useMobileNativeChatTerminalQueue>[0]

/** The chat's prompt cards (permission, question, ask) with the ask's dismissal, plus what only a
 *  terminal-backed chat has: the host's message queue. `resolution` is null otherwise. */
export function useMobileNativeChatTerminalLane(
  args: Omit<TerminalQueueArgs, 'supported' | 'unsubscribeSupported' | 'messages'> & {
    hostSupport: StructuredAgentSessionHostSupport | null | undefined
    status: AgentStatusEntry | null | undefined
    session: MobileNativeChatSession
    sessionId: string | null
    showNativeChat: boolean
    client: RpcClient | null
    /** A structured chat's session, whose async question is answered by a send. */
    structured: MobileStructuredAskSession | null
  }
): {
  bridgeAsk: MobileNativeChatPrompts & ReturnType<typeof useMobileNativeChatAskDismiss>
  terminalQueue: ReturnType<typeof useMobileNativeChatTerminalQueue> & {
    /** The queue as the controller hands it to the chat view. */
    controllerFields: Pick<
      MobileNativeChatController,
      'nativeChatQueue' | 'nativeChatWillQueue' | 'queueNativeChatImageSend'
    >
  }
  structuredAnswer: MobileNativeChatPrompts['structuredAnswer']
} {
  const { session, hostSupport, status, sessionId, showNativeChat, structured, ...queueArgs } = args
  const prompts = useMobileNativeChatPrompts({
    enabled: structured != null || args.resolution != null,
    structured,
    status,
    messages: session.messages,
    transcriptLoading: session.transcriptLoading
  })
  // A never-read transcript cannot prove that a dismissed prompt cleared.
  const transcriptSettled =
    session.status === 'ready' || (session.status === 'error' && session.messages.length > 0)
  const dismissal = useMobileNativeChatAskDismiss({
    ask: prompts.ask,
    startedAt: prompts.waitStartedAt,
    scopeKey: args.scopeKey,
    sessionKey: sessionId,
    observing: showNativeChat && (prompts.ask != null || transcriptSettled)
  })
  const terminalQueue = useMobileNativeChatTerminalQueue({
    ...queueArgs,
    supported: hostSupport?.terminalMessageQueue === true,
    unsubscribeSupported: hostSupport?.terminalMessageQueueUnsubscribe === true,
    messages: session.messages
  })
  return {
    bridgeAsk: { ...prompts, ...dismissal },
    terminalQueue: {
      ...terminalQueue,
      controllerFields: {
        nativeChatQueue: terminalQueue.stack,
        nativeChatWillQueue: terminalQueue.queue.willQueue,
        queueNativeChatImageSend: terminalQueue.queueImageSend
      }
    },
    structuredAnswer: prompts.structuredAnswer
  }
}
