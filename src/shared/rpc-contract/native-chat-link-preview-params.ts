import { z } from 'zod'
import { NATIVE_CHAT_LINK_CARD_MAX_URL_LENGTH } from '../native-chat-link-cards-payload'

// Why: the host re-validates both URLs (http/https, public host) before fetching,
// so the schema only bounds their size.
export const NativeChatLinkPreview = z.object({
  url: z.string().min(1).max(NATIVE_CHAT_LINK_CARD_MAX_URL_LENGTH),
  image: z.string().min(1).max(NATIVE_CHAT_LINK_CARD_MAX_URL_LENGTH).optional()
})
