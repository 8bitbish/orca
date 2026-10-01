import { createContext } from 'react'
import type {
  NativeChatSlackImageResult,
  NativeChatSlackImageVariant
} from '../../../../src/shared/native-chat-slack-image-contract'

export type MobileNativeChatSlack = {
  /** A card image from the chat's host; null when it cannot be had. Never rejects. */
  loadImage: (
    path: string,
    variant: NativeChatSlackImageVariant
  ) => Promise<NativeChatSlackImageResult | null>
}

/** Null outside native chat, where Slack cards show no images. */
export const MobileNativeChatSlackContext = createContext<MobileNativeChatSlack | null>(null)
