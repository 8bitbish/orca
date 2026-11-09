import type { RpcClient } from '../transport/rpc/rpc-client-contract'
import type { StructuredAgentSessionHostSupport } from './mobile-structured-agent-session-host-support'
import type { MobileNativeChatSession } from './native-chat/use-mobile-native-chat-session'
import { useMobileNativeChatTerminalQueue } from './use-mobile-native-chat-terminal-queue'
import type { MobileNativeChatController } from './native-chat/mobile-native-chat-controller-contract'
import { mobileNativeChatScopeKey } from './native-chat/mobile-native-chat-scope-key'

type TerminalQueueArgs = Parameters<typeof useMobileNativeChatTerminalQueue>[0]

/** The chat controller's args the terminal lane reads. */
export type MobileNativeChatTerminalLaneHostArgs = {
  client: RpcClient | null
  hostId: string
  worktreeId: string
  activeSessionTabId: string | null
  /** The active tab's terminal handle; the host queue is addressed by it. */
  activeHandle?: string | null
  agentSessionHostSupport?: StructuredAgentSessionHostSupport | null
  onSendError: TerminalQueueArgs['onSendError']
}

/** What only a terminal-backed chat has: the host's message queue. `resolution` is null otherwise. */
export function useMobileNativeChatTerminalLane(
  host: MobileNativeChatTerminalLaneHostArgs,
  session: MobileNativeChatSession,
  chat: Pick<TerminalQueueArgs, 'resolution'> & {
    drafts: Pick<TerminalQueueArgs, 'captureSendOrigin' | 'acceptSend' | 'clearDraftForSend'> & {
      setText: TerminalQueueArgs['setComposerText']
    }
  }
): {
  terminalQueue: ReturnType<typeof useMobileNativeChatTerminalQueue> & {
    /** The queue as the controller hands it to the chat view. */
    controllerFields: Pick<
      MobileNativeChatController,
      'nativeChatQueue' | 'nativeChatWillQueue' | 'queueNativeChatImageSend'
    >
  }
} {
  const { setText, ...draftArgs } = chat.drafts
  const hostSupport = host.agentSessionHostSupport
  const terminalQueue = useMobileNativeChatTerminalQueue({
    resolution: chat.resolution,
    terminal: host.activeHandle ?? null,
    scopeKey: mobileNativeChatScopeKey(host.hostId, host.worktreeId, host.activeSessionTabId),
    client: host.client,
    onSendError: host.onSendError,
    ...draftArgs,
    setComposerText: setText,
    supported: hostSupport?.terminalMessageQueue === true,
    unsubscribeSupported: hostSupport?.terminalMessageQueueUnsubscribe === true,
    messages: session.messages
  })
  return {
    terminalQueue: {
      ...terminalQueue,
      controllerFields: {
        nativeChatQueue: terminalQueue.stack,
        nativeChatWillQueue: terminalQueue.queue.willQueue,
        queueNativeChatImageSend: terminalQueue.queueImageSend
      }
    }
  }
}
