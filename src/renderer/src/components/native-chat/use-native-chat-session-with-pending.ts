import { useMemo } from 'react'
import type { NativeChatMessage } from '../../../../shared/native-chat/native-chat-types'
import {
  deriveNativeChatStreamingText,
  nativeChatStreamingMessage
} from '../../../../shared/native-chat/native-chat-streaming'
import {
  pendingSendsAsMessages,
  type NativeChatPendingSend
} from '../../../../shared/native-chat/transcript/native-chat-pending-sends'
import {
  commandMarkersAsMessages,
  type NativeChatCommandMarker
} from './session/terminal/delivery/native-chat-command-marker'

/** The session as the pane draws it: the transcript, then local command lines, the streaming
 *  preview and the sends not yet in the transcript, each placed against the current working epoch. */
export function useNativeChatSessionWithPending<S extends { messages: NativeChatMessage[] }>(
  session: S,
  args: {
    pending: NativeChatPendingSend[]
    commandMarkers: NativeChatCommandMarker[]
    previewText: string | null | undefined
    working: boolean
    previewIsToolOutput: boolean | undefined
    workingEpoch: number | null | undefined
  }
): S {
  const { pending, commandMarkers, previewText, working, previewIsToolOutput, workingEpoch } = args
  const pendingMessages = useMemo(
    () => pendingSendsAsMessages(pending, session.messages, workingEpoch),
    [pending, session.messages, workingEpoch]
  )
  // Stable across preview ticks so a long history is not re-spread on every streamed chunk.
  const messagesWithPending = useMemo(
    () =>
      pendingMessages.length === 0 ? session.messages : [...session.messages, ...pendingMessages],
    [session.messages, pendingMessages]
  )
  const streamingText = useMemo(
    () =>
      deriveNativeChatStreamingText({
        messages: messagesWithPending,
        previewText,
        working,
        previewIsToolOutput
      }),
    [messagesWithPending, previewText, working, previewIsToolOutput]
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
