import { z } from 'zod'
import { NATIVE_CHAT_SLACK_NAMES_MAX_IDS } from '../native-chat-slack-names-contract'

// Why: the path is only a request; the host resolves it inside slack-mcp's cache
// folder and refuses anything else, so the schema bounds its size, not its content.
export const NativeChatSlackImage = z.object({
  path: z.string().min(1).max(1024),
  variant: z.enum(['thumbnail', 'full'])
})

const SlackUserId = z.string().regex(/^[UW][A-Z0-9]{2,20}$/)
const SlackConversationId = z.string().regex(/^[CDG][A-Z0-9]{2,20}$/)

export const NativeChatSlackNames = z.object({
  userIds: z.array(SlackUserId).max(NATIVE_CHAT_SLACK_NAMES_MAX_IDS),
  channelIds: z.array(SlackConversationId).max(NATIVE_CHAT_SLACK_NAMES_MAX_IDS)
})
