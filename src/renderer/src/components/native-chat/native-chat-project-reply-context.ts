import { createContext, useMemo, type RefObject } from 'react'
import type { NativeChatMessage } from '../../../../shared/native-chat-types'
import type { NativeChatComposerHandle } from './native-chat-composer-types'

/** How a project card in a reply answers: through this chat's own composer. */
export type NativeChatProjectReplyChannel = {
  /** Sends `text` as the user's next message; false when nothing was sent. */
  send: (text: string) => boolean
  canSend: boolean
  /** The transcript the card sits in, to tell which of its actions was already sent. */
  messages: readonly NativeChatMessage[]
}

/** No provider: the card is outside a chat that can answer, so its actions stay disabled. */
export const NativeChatProjectReplyContext = createContext<NativeChatProjectReplyChannel | null>(
  null
)

export function useNativeChatProjectReplyChannel(
  composerRef: RefObject<NativeChatComposerHandle | null>,
  canSend: boolean,
  messages: readonly NativeChatMessage[]
): NativeChatProjectReplyChannel {
  return useMemo(
    () => ({
      send: (text: string) => composerRef.current?.sendReply(text) ?? false,
      canSend,
      messages
    }),
    [canSend, composerRef, messages]
  )
}
