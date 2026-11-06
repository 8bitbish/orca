import type { RpcClient } from '../transport/rpc-client'
import type { StructuredAgentSessionHostSupport } from './mobile-structured-agent-session-host-support'
import type { MobileNativeChatSession } from './native-chat/use-mobile-native-chat-session'
import { useMobileNativeChatTerminalQueue } from './use-mobile-native-chat-terminal-queue'
import type { MobileNativeChatController } from './native-chat/mobile-native-chat-controller-contract'

type TerminalQueueArgs = Parameters<typeof useMobileNativeChatTerminalQueue>[0]

/** What only a terminal-backed chat has: the host's message queue. `resolution` is null otherwise. */
export function useMobileNativeChatTerminalLane(
  args: Pick<TerminalQueueArgs, 'resolution' | 'terminal' | 'scopeKey'> & {
    drafts: Pick<TerminalQueueArgs, 'captureSendOrigin' | 'acceptSend' | 'clearDraftForSend'> & {
      setText: TerminalQueueArgs['setComposerText']
    }
    chat: Pick<TerminalQueueArgs, 'onSendError'> & {
      client: RpcClient | null
      session: MobileNativeChatSession
      hostSupport: StructuredAgentSessionHostSupport | null | undefined
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
  const { drafts, chat, ...target } = args
  const { session, hostSupport, ...chatArgs } = chat
  const { setText, ...draftArgs } = drafts
  const terminalQueue = useMobileNativeChatTerminalQueue({
    ...target,
    ...chatArgs,
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
