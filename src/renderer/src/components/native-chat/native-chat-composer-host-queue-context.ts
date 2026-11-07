import { createContext } from 'react'
import type { NativeChatComposerQueue } from './native-chat-composer-types'

/** A terminal chat's host-side mid-turn queue; absent (structured chats, old hosts) keeps every send direct. */
export const NativeChatComposerHostQueueContext = createContext<NativeChatComposerQueue | null>(
  null
)
