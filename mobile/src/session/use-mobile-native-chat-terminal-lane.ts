import type { RpcClient } from '../transport/rpc-client'
import type { StructuredAgentSessionHostSupport } from './mobile-structured-agent-session-host-support'
import type { MobileNativeChatSession } from './use-mobile-native-chat-session'
import { useMobileNativeChatTerminalQueue } from './use-mobile-native-chat-terminal-queue'
import type { MobileNativeChatController } from './mobile-native-chat-controller-contract'

type TerminalQueueArgs = Parameters<typeof useMobileNativeChatTerminalQueue>[0]

/** What only a terminal-backed chat has: the host's message queue. `resolution` is null otherwise. */
export function useMobileNativeChatTerminalLane(
  args: Omit<TerminalQueueArgs, 'supported' | 'unsubscribeSupported' | 'messages'> & {
    hostSupport: StructuredAgentSessionHostSupport | null | undefined
    session: MobileNativeChatSession
    client: RpcClient | null
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
  const { session, hostSupport, ...queueArgs } = args
  const terminalQueue = useMobileNativeChatTerminalQueue({
    ...queueArgs,
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
