import type { AgentStatusEntry } from '../../../src/shared/agent-status-types'
import { useMobileNativeChatAskDismiss } from './use-mobile-native-chat-ask-dismiss'
import {
  useMobileNativeChatPrompts,
  type MobileNativeChatPrompts
} from './use-mobile-native-chat-prompts'
import type { MobileNativeChatSession } from './use-mobile-native-chat-session'

/** The bridge lane's prompt cards (permission, question, ask) and the ask's dismissal. */
export function useMobileNativeChatBridgeAsk(args: {
  enabled: boolean
  status: AgentStatusEntry | null | undefined
  session: MobileNativeChatSession
  tabId: string | null
  sessionId: string | null
  showNativeChat: boolean
}): MobileNativeChatPrompts & ReturnType<typeof useMobileNativeChatAskDismiss> {
  const { session } = args
  const prompts = useMobileNativeChatPrompts({
    enabled: args.enabled,
    status: args.status,
    messages: session.messages,
    transcriptLoading: session.transcriptLoading
  })
  // A never-read transcript cannot prove that a dismissed prompt cleared.
  const transcriptSettled =
    session.status === 'ready' || (session.status === 'error' && session.messages.length > 0)
  const dismissal = useMobileNativeChatAskDismiss({
    ask: prompts.ask,
    detectedAsk: prompts.detectedAsk,
    scopeKey: args.tabId,
    sessionKey: args.sessionId,
    observing: args.showNativeChat && (prompts.detectedAsk != null || transcriptSettled)
  })
  return { ...prompts, ...dismissal }
}
