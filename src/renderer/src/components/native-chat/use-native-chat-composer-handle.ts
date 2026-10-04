import { useCallback, useImperativeHandle, type ForwardedRef } from 'react'
import type { ClipboardEventLike } from './native-chat-clipboard-payload'
import type {
  NativeChatComposerHandle,
  NativeChatStructuredComposerTransport
} from './native-chat-composer-types'
import type { NativeChatComposerImageAttachment } from './NativeChatComposerField'
import {
  useNativeChatComposerPaste,
  type UseNativeChatComposerPasteArgs
} from './use-native-chat-composer-paste'
import { useNativeChatTypedInsertion } from './use-native-chat-typed-insertion'

type UseNativeChatComposerHandleArgs = Parameters<typeof useNativeChatTypedInsertion>[0] &
  Omit<UseNativeChatComposerPasteArgs, 'insertTypedText'> & {
    sendPty: (reply?: string) => boolean
    sendStructured: (
      text: string,
      attachments?: readonly NativeChatComposerImageAttachment[],
      options?: { keepDraft?: boolean }
    ) => void
    structuredTransport: NativeChatStructuredComposerTransport | undefined
  }

/** Typed and pasted insertion for the composer, exposed on the handle the chat
 *  root uses to route keystrokes and pastes into it, plus the reply send a project
 *  card uses and the queued-message restore. Returns the paste handler. */
export function useNativeChatComposerHandle(
  ref: ForwardedRef<NativeChatComposerHandle>,
  args: UseNativeChatComposerHandleArgs
): (event: ClipboardEventLike) => void {
  const {
    textareaRef,
    draft,
    setDraft,
    setHistory,
    setActiveSuggestion,
    sendPty,
    sendStructured,
    structuredTransport,
    ...pasteArgs
  } = args
  const { disabled, attachResolvedPaths, setCaret } = pasteArgs
  const { insertTypedText, insertPastedText, focus, contains } = useNativeChatTypedInsertion({
    textareaRef,
    caret: args.caret,
    draft,
    setDraft,
    setCaret,
    setHistory,
    setActiveSuggestion
  })

  const { handlePaste: handlePasteEvent, pasteFromClipboard } = useNativeChatComposerPaste({
    ...pasteArgs,
    insertTypedText: insertPastedText
  })

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

  useImperativeHandle(
    ref,
    () => ({
      focus,
      insertTypedText,
      handlePasteEvent,
      pasteFromClipboard,
      contains,
      sendReply,
      restoreDraft
    }),
    [
      focus,
      insertTypedText,
      handlePasteEvent,
      pasteFromClipboard,
      contains,
      sendReply,
      restoreDraft
    ]
  )
  return handlePasteEvent
}
