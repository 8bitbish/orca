import type { NativeChatComposerQueue } from './native-chat-composer-types'
import type { NativeChatWorkingSend } from './NativeChatComposerActions'
import type { NativeChatComposerImageAttachment } from './NativeChatComposerField'

/** The composer's send affordances: Send/Stop and the terminal chat's mid-turn queue button. */
export function useNativeChatComposerQueueAffordances(args: {
  draft: string
  imageAttachments: readonly NativeChatComposerImageAttachment[]
  isWorking: boolean
  disabled: boolean
  hasPty: boolean
  canStop: boolean
  structured: boolean
  queue: NativeChatComposerQueue | null | undefined
}): {
  sendButtonDisabled: boolean
  workingSend: NativeChatWorkingSend | null
} {
  const { draft } = args
  // A pasted image has no agent-readable path until its save lands; sending
  // mid-save would ship the message without the image the chip promises.
  const hasPendingAttachment = args.imageAttachments.some((attachment) => attachment.pending)
  const draftEmpty = draft.trim() === '' && args.imageAttachments.length === 0
  const sendButtonDisabled = args.isWorking
    ? !args.hasPty || !args.canStop
    : args.disabled || hasPendingAttachment || draftEmpty
  // While the agent works, a written draft still gets a send action beside Stop: it queues on a
  // host that holds mid-turn prompts, and sends straight away where the main agent is idle.
  // Structured chats queue through upstream's outbox cards instead.
  const workingSend =
    args.isWorking && !draftEmpty && !args.structured
      ? {
          kind: args.queue?.willQueue ? ('queue' as const) : ('send' as const),
          disabled: args.disabled || hasPendingAttachment
        }
      : null
  return { sendButtonDisabled, workingSend }
}
