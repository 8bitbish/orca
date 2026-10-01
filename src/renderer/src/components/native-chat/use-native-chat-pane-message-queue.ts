import { useCallback, useMemo, type RefObject } from 'react'
import type { AgentType } from '../../../../shared/native-chat-types'
import type { TerminalQueuedMessage } from '../../../../shared/terminal-message-queue-contract'
import type {
  NativeChatComposerHandle,
  NativeChatComposerQueue
} from './native-chat-composer-types'
import type { NativeChatQueuedMessagesProps } from './NativeChatQueuedMessages'
import { useNativeChatMessageQueue } from './use-native-chat-message-queue'

/** Binds a terminal chat pane to its host queue: composer routing, the stack, and Stop. */
export function useNativeChatPaneMessageQueue(args: {
  paneKey: string
  agent: AgentType
  sessionId: string | null
  transcriptPath?: string | null
  targetPtyId: string | null
  composerRef: RefObject<NativeChatComposerHandle | null>
  /** Echo a delivered item the way a direct send is echoed, until its transcript turn lands. */
  onDelivered: (text: string, imagePaths: string[]) => void
}): {
  composerQueue: NativeChatComposerQueue | null
  stackProps: NativeChatQueuedMessagesProps
  /** True when the host took the Stop (and will send the next item); false to stop as before. */
  stop: () => boolean
} {
  const { agent, composerRef, onDelivered, sessionId, transcriptPath } = args
  const session = useMemo(
    () => (sessionId ? { agent, sessionId, ...(transcriptPath ? { transcriptPath } : {}) } : null),
    [agent, sessionId, transcriptPath]
  )
  const handleDelivered = useCallback(
    (item: TerminalQueuedMessage) => onDelivered(item.text, item.imagePaths ?? []),
    [onDelivered]
  )
  const queue = useNativeChatMessageQueue({
    paneKey: args.paneKey,
    ptyId: args.targetPtyId,
    session,
    onDelivered: handleDelivered
  })
  const { active, dismissOrphan, enqueue, remove, willQueue } = queue
  const composerQueue = useMemo(
    () => (active ? { willQueue, enqueue } : null),
    [active, enqueue, willQueue]
  )
  const onRestore = useCallback(
    (item: { id: string; text: string; imagePaths?: string[] }, orphan: boolean) => {
      const composer = composerRef.current
      if (!composer) {
        return
      }
      composer.restoreDraft(item.text, item.imagePaths ?? [])
      if (orphan) {
        dismissOrphan(item.id)
      } else {
        remove(item.id)
      }
    },
    [composerRef, dismissOrphan, remove]
  )
  return {
    composerQueue,
    stackProps: {
      snapshot: queue.snapshot,
      orphans: queue.orphans,
      lastStop: queue.lastStop,
      onRemove: remove,
      onSetEditing: queue.setEditing,
      onSaveEdit: queue.saveEdit,
      onRestore,
      onDiscardOrphan: dismissOrphan,
      onSendNext: queue.sendNext
    },
    stop: queue.stop
  }
}
