import type { NativeChatComposerQueue } from './native-chat-composer-types'
import type { NativeChatWorkingSend } from './NativeChatComposerActions'
import type { NativeChatComposerImageAttachment } from './NativeChatComposerField'

/** The terminal chat's send action beside Stop while the agent works: it queues on a host
 *  that holds mid-turn prompts, and sends straight away where the main agent is idle.
 *  Structured chats queue through upstream's held-queue cards instead. */
export function useNativeChatComposerWorkingSend(args: {
  draft: string
  imageAttachments: readonly NativeChatComposerImageAttachment[]
  isWorking: boolean
  /** Upstream's hold on sending (disabled, send out, an image not ready). */
  sendHeld: boolean
  structured: boolean
  queue: NativeChatComposerQueue | null | undefined
}): NativeChatWorkingSend | null {
  const draftEmpty = args.draft.trim() === '' && args.imageAttachments.length === 0
  return args.isWorking && !draftEmpty && !args.structured
    ? { kind: args.queue?.willQueue ? 'queue' : 'send', disabled: args.sendHeld }
    : null
}
