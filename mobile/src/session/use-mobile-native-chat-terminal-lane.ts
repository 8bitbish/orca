import type { AgentStatusEntry } from '../../../src/shared/agent-status-types'
import type { RpcClient } from '../transport/rpc-client'
import type { StructuredAgentSessionHostSupport } from './mobile-structured-agent-session-host-support'
import { useMobileNativeChatAskDismiss } from './use-mobile-native-chat-ask-dismiss'
import {
  useMobileNativeChatPrompts,
  type MobileNativeChatPrompts
} from './use-mobile-native-chat-prompts'
import type { MobileNativeChatSession } from './use-mobile-native-chat-session'
import { useMobileNativeChatTerminalQueue } from './use-mobile-native-chat-terminal-queue'

type TerminalQueueArgs = Parameters<typeof useMobileNativeChatTerminalQueue>[0]

/** What only a terminal-backed chat has: the bridge lane's prompt cards (permission, question,
 *  ask) with the ask's dismissal, and the host's message queue. `resolution` is null otherwise. */
export function useMobileNativeChatTerminalLane(
  args: Omit<TerminalQueueArgs, 'supported' | 'unsubscribeSupported' | 'messages'> & {
    hostSupport: StructuredAgentSessionHostSupport | null | undefined
    status: AgentStatusEntry | null | undefined
    session: MobileNativeChatSession
    sessionId: string | null
    showNativeChat: boolean
    client: RpcClient | null
  }
): {
  bridgeAsk: MobileNativeChatPrompts & ReturnType<typeof useMobileNativeChatAskDismiss>
  terminalQueue: ReturnType<typeof useMobileNativeChatTerminalQueue>
} {
  const { session, hostSupport, status, sessionId, showNativeChat, ...queueArgs } = args
  const prompts = useMobileNativeChatPrompts({
    enabled: args.resolution != null,
    status,
    messages: session.messages,
    transcriptLoading: session.transcriptLoading
  })
  // A never-read transcript cannot prove that a dismissed prompt cleared.
  const transcriptSettled =
    session.status === 'ready' || (session.status === 'error' && session.messages.length > 0)
  const dismissal = useMobileNativeChatAskDismiss({
    ask: prompts.ask,
    detectedAsk: prompts.detectedAsk,
    scopeKey: args.scopeKey,
    sessionKey: sessionId,
    observing: showNativeChat && (prompts.detectedAsk != null || transcriptSettled)
  })
  const terminalQueue = useMobileNativeChatTerminalQueue({
    ...queueArgs,
    supported: hostSupport?.terminalMessageQueue === true,
    unsubscribeSupported: hostSupport?.terminalMessageQueueUnsubscribe === true,
    messages: session.messages
  })
  return { bridgeAsk: { ...prompts, ...dismissal }, terminalQueue }
}
