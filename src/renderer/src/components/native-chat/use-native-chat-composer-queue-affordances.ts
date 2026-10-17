import type { NativeChatComposerQueue } from './native-chat-composer-types'
import type { NativeChatWorkingSend } from './NativeChatComposerActions'

/** The terminal chat's send action beside Stop while the agent works: it queues on a host
 *  that holds mid-turn prompts, and sends straight away where the main agent is idle.
 *  Structured chats queue through upstream's own queue instead. */
export function useNativeChatComposerWorkingSend(args: {
  draftEmpty: boolean
  isWorking: boolean
  /** Upstream's hold on sending (disabled, send out, an image not ready). */
  sendHeld: boolean
  structured: boolean
  queue: NativeChatComposerQueue | null | undefined
}): NativeChatWorkingSend | null {
  return args.isWorking && !args.draftEmpty && !args.structured
    ? { kind: args.queue?.willQueue ? 'queue' : 'send', disabled: args.sendHeld }
    : null
}
