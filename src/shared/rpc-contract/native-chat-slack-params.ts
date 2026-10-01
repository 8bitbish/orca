import { z } from 'zod'

// Why: the path is only a request; the host resolves it inside slack-mcp's cache
// folder and refuses anything else, so the schema bounds its size, not its content.
export const NativeChatSlackImage = z.object({
  path: z.string().min(1).max(1024),
  variant: z.enum(['thumbnail', 'full'])
})
