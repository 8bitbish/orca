import { useMemo } from 'react'
import type { NativeChatMessage } from '../../../../shared/native-chat-types'
import {
  deriveNativeChatStreamingText,
  nativeChatStreamingMessage
} from '../../../../shared/native-chat/native-chat-streaming'
import {
  isQueuedPendingMessageId,
  pendingSendsAsMessages,
  type NativeChatPendingSend
} from '../../../../shared/native-chat-pending-sends'
import {
  commandMarkersAsMessages,
  type NativeChatCommandMarker
} from './native-chat-command-marker'

/** The session as the pane draws it: the transcript, then local command lines, the streaming
 *  preview and the sends not yet in the transcript. The list sorts the streaming bubble below
 *  idle-send echoes and above queued ones. */
export function useNativeChatSessionWithPending<S extends { messages: NativeChatMessage[] }>(
  session: S,
  args: {
    pending: NativeChatPendingSend[]
    commandMarkers: NativeChatCommandMarker[]
    previewText: string | null | undefined
    working: boolean
    previewIsToolOutput: boolean | undefined
  }
): S {
  const { pending, commandMarkers, previewText, working, previewIsToolOutput } = args
  const pendingMessages = useMemo(
    () => pendingSendsAsMessages(pending, session.messages),
    [pending, session.messages]
  )
  const streamingText = useMemo(
    () =>
      deriveNativeChatStreamingText({
        messages: session.messages,
        previewText,
        working,
        previewIsToolOutput,
        hasOpenIdleSend: pendingMessages.some((message) => !isQueuedPendingMessageId(message.id))
      }),
    [session.messages, pendingMessages, previewText, working, previewIsToolOutput]
  )
  return useMemo<S>(() => {
    if (pending.length === 0 && commandMarkers.length === 0 && !streamingText) {
      return session
    }
    return {
      ...session,
      messages: [
        ...session.messages,
        ...commandMarkersAsMessages(commandMarkers),
        ...(streamingText ? [nativeChatStreamingMessage(streamingText)] : []),
        ...pendingMessages
      ]
    }
  }, [session, pending, pendingMessages, commandMarkers, streamingText])
}
