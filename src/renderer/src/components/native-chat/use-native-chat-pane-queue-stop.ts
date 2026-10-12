import { useCallback, type RefObject } from 'react'
import type { AgentType } from '../../../../shared/native-chat-types'
import type { NativeChatComposerHandle } from './native-chat-composer-types'
import type { NativeChatInteractiveSend } from './use-native-chat-interactive-send'
import { useNativeChatPaneMessageQueue } from './use-native-chat-pane-message-queue'

/** The pane's host-side message queue and the Stop that respects it. */
export function useNativeChatPaneQueueStop(args: {
  paneKey: string
  agent: AgentType
  sessionId: string | null
  transcriptPath?: string | null
  targetPtyId: string | null
  composerRef: RefObject<NativeChatComposerHandle | null>
  appendDeliveredEcho: (text: string, imagePaths: string[]) => void
  clear: () => void
  interactiveSend: NativeChatInteractiveSend
  setWorkingInterrupted: (interrupted: boolean) => void
}): { messageQueue: ReturnType<typeof useNativeChatPaneMessageQueue>; stopAgent: () => void } {
  const { appendDeliveredEcho, clear, interactiveSend, setWorkingInterrupted } = args
  const onDelivered = useCallback(
    (text: string, imagePaths: string[]) => {
      setWorkingInterrupted(false)
      appendDeliveredEcho(text, imagePaths)
    },
    [appendDeliveredEcho, setWorkingInterrupted]
  )
  const messageQueue = useNativeChatPaneMessageQueue({ ...args, onDelivered })
  const stopQueue = messageQueue.stop
  const stopAgent = useCallback(() => {
    setWorkingInterrupted(true)
    // Why: Stop after a submitted turn drops the delayed-write handle once it
    // settles, so cancelPendingSends no longer sees the optimistic id. Clear
    // the echo cache here so a cancelled prompt cannot stick as a ghost bubble.
    // Host-queued messages are not echoes, so they survive this.
    clear()
    if (stopQueue()) {
      // The host writes the interrupt and sends the next queued message once the turn ends.
      interactiveSend.cancelPending()
      return
    }
    interactiveSend.cancel()
  }, [clear, interactiveSend, setWorkingInterrupted, stopQueue])
  return { messageQueue, stopAgent }
}
