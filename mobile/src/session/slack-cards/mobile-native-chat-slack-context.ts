import { createContext } from 'react'
import type {
  NativeChatSlackImageResult,
  NativeChatSlackImageVariant
} from '../../../../src/shared/native-chat-slack-image-contract'
import type {
  NativeChatSlackNamesRequest,
  NativeChatSlackNamesResult
} from '../../../../src/shared/native-chat-slack-names-contract'

export type MobileNativeChatSlack = {
  /** A card image from the chat's host; null when it cannot be had. Never rejects. */
  loadImage: (
    path: string,
    variant: NativeChatSlackImageVariant
  ) => Promise<NativeChatSlackImageResult | null>
  /** Names for mention ids from the host's slack-mcp cache; empty when unknown. Never rejects. */
  loadNames: (request: NativeChatSlackNamesRequest) => Promise<NativeChatSlackNamesResult>
}

/** Null outside native chat, where Slack cards show no images and mentions show ids. */
export const MobileNativeChatSlackContext = createContext<MobileNativeChatSlack | null>(null)
