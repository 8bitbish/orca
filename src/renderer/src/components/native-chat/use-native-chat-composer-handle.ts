import { useCallback, useImperativeHandle, type ForwardedRef } from 'react'
import type {
  NativeChatComposerHandle,
  NativeChatStructuredComposerTransport
} from './native-chat-composer-types'
import type { NativeChatComposerImageAttachment } from './NativeChatComposerField'

/** The composer's imperative surface, including the reply send a project card uses. */
export function useNativeChatComposerHandle(
  ref: ForwardedRef<NativeChatComposerHandle>,
  args: Omit<NativeChatComposerHandle, 'sendReply'> & {
    disabled: boolean
    sendPty: (reply?: string) => boolean
    sendStructured: (
      text: string,
      attachments?: readonly NativeChatComposerImageAttachment[],
      options?: { keepDraft?: boolean }
    ) => void
    structuredTransport: NativeChatStructuredComposerTransport | undefined
  }
): void {
  const { disabled, sendPty, sendStructured, structuredTransport } = args
  const { focus, insertTypedText, handlePasteEvent, pasteFromClipboard } = args
  // Sent like typed text through the same path as Enter, leaving the user's draft in place.
  const sendReply = useCallback(
    (text: string): boolean => {
      if (!structuredTransport) {
        return sendPty(text)
      }
      if (disabled || text.trim() === '') {
        return false
      }
      sendStructured(text, [], { keepDraft: true })
      return true
    },
    [disabled, sendPty, sendStructured, structuredTransport]
  )
  useImperativeHandle(
    ref,
    () => ({ focus, insertTypedText, handlePasteEvent, pasteFromClipboard, sendReply }),
    [focus, insertTypedText, handlePasteEvent, pasteFromClipboard, sendReply]
  )
}
