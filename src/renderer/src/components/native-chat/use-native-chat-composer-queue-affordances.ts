import { useCallback } from 'react'
import type { NativeChatComposerQueue } from './native-chat-composer-types'
import type { NativeChatWorkingSend } from './NativeChatComposerActions'
import type { NativeChatComposerImageAttachment } from './NativeChatComposerField'

/** The composer's send affordances: Send/Stop, the mid-turn queue button, and draft restore. */
export function useNativeChatComposerQueueAffordances(args: {
  draft: string
  imageAttachments: readonly NativeChatComposerImageAttachment[]
  isWorking: boolean
  disabled: boolean
  hasPty: boolean
  canStop: boolean
  structured: boolean
  queue: NativeChatComposerQueue | null | undefined
  setDraft: (value: string) => void
  setCaret: (caret: number) => void
  attachResolvedPaths: (paths: string[]) => void
  focus: () => boolean
}): {
  sendButtonDisabled: boolean
  workingSend: NativeChatWorkingSend | null
  restoreDraft: (text: string, imagePaths: readonly string[]) => void
} {
  const { attachResolvedPaths, draft, focus, setCaret, setDraft } = args
  const restoreDraft = useCallback(
    (text: string, imagePaths: readonly string[]) => {
      const next = draft.trim() === '' ? text : `${draft}\n${text}`
      setDraft(next)
      setCaret(next.length)
      if (imagePaths.length > 0) {
        attachResolvedPaths([...imagePaths])
      }
      focus()
    },
    [attachResolvedPaths, draft, focus, setCaret, setDraft]
  )
  // A pasted image has no agent-readable path until its save lands; sending
  // mid-save would ship the message without the image the chip promises.
  const hasPendingAttachment = args.imageAttachments.some((attachment) => attachment.pending)
  const draftEmpty = draft.trim() === '' && args.imageAttachments.length === 0
  const sendButtonDisabled = args.isWorking
    ? !args.hasPty || !args.canStop
    : args.disabled || hasPendingAttachment || draftEmpty
  // While the agent works, a written draft still gets a send action beside Stop: it queues on a
  // host that holds mid-turn prompts, and sends straight away where the main agent is idle.
  const workingSend =
    args.isWorking && !draftEmpty && !args.structured
      ? {
          kind: args.queue?.willQueue ? ('queue' as const) : ('send' as const),
          disabled: args.disabled || hasPendingAttachment
        }
      : null
  return { sendButtonDisabled, workingSend, restoreDraft }
}
