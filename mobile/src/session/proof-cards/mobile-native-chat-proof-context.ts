import { createContext } from 'react'
import type { MobileNativeChatProofMediaLoader } from './mobile-native-chat-proof-media-loader'

/** Whether this chat's host can send proof media, and the loader when it can. */
export type MobileNativeChatProofMediaSource =
  | { status: 'pending' }
  | { status: 'unsupported' }
  | { status: 'supported'; loader: MobileNativeChatProofMediaLoader }

/** Null outside native chat, where a proof card's media shows as unavailable. */
export const MobileNativeChatProofMediaContext =
  createContext<MobileNativeChatProofMediaSource | null>(null)
