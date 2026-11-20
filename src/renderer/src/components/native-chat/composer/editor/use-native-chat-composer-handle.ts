import { useCallback, useImperativeHandle, type ForwardedRef } from 'react'
import type { ClipboardEventLike } from '../../paste/native-chat-clipboard-payload'
import type { NativeChatComposerHandle } from '../native-chat-composer-types'
import type { NativeChatStructuredComposerTransport } from '../submit/native-chat-structured-composer-transport'
import { useNativeChatComposerPaste } from '../../paste/use-native-chat-composer-paste'
import type { UseNativeChatComposerPasteArgs } from '../../paste/native-chat-composer-paste-options'
import { useNativeChatTypedInsertion } from './use-native-chat-typed-insertion'
import type { NativeChatStructuredComposerSend } from '../submit/use-native-chat-structured-composer-send'
import { useNativeChatPastedTextFile } from '../../paste/use-native-chat-pasted-text-file'
import {
  writeNativeChatComposerText,
  type NativeChatComposerInput
} from './native-chat-composer-input'
import { glowNativeChatComposer } from '../../native-chat-composer-glow'

type UseNativeChatComposerHandleArgs = Parameters<typeof useNativeChatTypedInsertion>[0] &
  Omit<UseNativeChatComposerPasteArgs, 'insertTypedText'> & {
    /** Intake only: captured with the paste action, never consulted during settlement. */
    resend?: NativeChatComposerHandle['resend']
    /** A structured chat's editor while it shows this scope, where a long paste saved as a file lands. */
    pastedTextEditor: (() => NativeChatComposerInput | null) | null
    /** A chat composer's sends, for card replies and queued-message restore; other boxes take none. */
    reply?: {
      /** The draft a restored queued message is appended to. */
      draft: string
      sendPty: (reply?: string) => boolean
      /** A card's reply goes straight out and leaves the draft. */
      sendStructured: NativeChatStructuredComposerSend
      structuredTransport: NativeChatStructuredComposerTransport | undefined
    }
    /** Text this long pastes as a "Pasted text" file; defaults to chat's. */
    longPasteThreshold?: number
  }

/** Expose typed/pasted insertion, the project-card reply send and queued-message restore to pane
 *  routing, and return the paste handler. */
export function useNativeChatComposerHandle(
  ref: ForwardedRef<NativeChatComposerHandle>,
  args: UseNativeChatComposerHandleArgs
): (event: ClipboardEventLike) => void {
  const {
    textareaRef,
    isComposing,
    setDraft,
    setActiveSuggestion,
    reply,
    pastedTextEditor,
    resend,
    ...pasteArgs
  } = args
  const { disabled, attachResolvedPaths, setCaret } = pasteArgs
  const {
    insertTypedText,
    appendText: appendPlainText,
    acceptsText,
    insertPastedText,
    focus: focusInput,
    contains
  } = useNativeChatTypedInsertion({
    textareaRef,
    isComposing,
    setDraft,
    setCaret,
    setActiveSuggestion
  })

  const { attachmentScopeKey } = args
  const appendText = useCallback(
    (text: string, options?: { glow?: boolean }): void => {
      appendPlainText(text)
      if (options?.glow && attachmentScopeKey) {
        glowNativeChatComposer(attachmentScopeKey)
      }
    },
    [appendPlainText, attachmentScopeKey]
  )

  const focus = useCallback(
    (options?: { caretAtEnd?: boolean; glow?: boolean }): boolean => {
      const focused = focusInput(options)
      if (focused && options?.glow && attachmentScopeKey) {
        glowNativeChatComposer(attachmentScopeKey)
      }
      return focused
    },
    [focusInput, attachmentScopeKey]
  )

  const insertPastedTextOrFile = useNativeChatPastedTextFile({
    scopeKey: args.attachmentScopeKey ?? '',
    // Without a draft scope there is no draft for a pending paste to settle in.
    scopeEditor: args.attachmentScopeKey ? pastedTextEditor : null,
    resolveAttachmentOwner: args.resolveAttachmentOwner,
    insertTypedText: insertPastedText,
    setNotice: args.setNotice,
    longPasteThreshold: args.longPasteThreshold
  })
  const { handlePaste: handlePasteEvent, pasteFromClipboard } = useNativeChatComposerPaste({
    ...pasteArgs,
    insertTypedText: insertPastedTextOrFile
  })

  // Sent like typed text through the same path as Enter, leaving the user's draft in place.
  const sendReply = useCallback(
    (text: string): boolean => {
      if (!reply?.structuredTransport) {
        return reply?.sendPty(text) ?? false
      }
      if (disabled || text.trim() === '') {
        return false
      }
      void reply.sendStructured(text, [], undefined, { keepDraft: true })
      return true
    },
    [disabled, reply]
  )
  const restoreDraft = useCallback(
    (text: string, imagePaths: readonly string[]) => {
      const draft = reply?.draft ?? ''
      const next = draft.trim() === '' ? text : `${draft}\n${text}`
      setDraft(next)
      const textarea = textareaRef.current
      if (textarea && !isComposing()) {
        writeNativeChatComposerText(textarea, next, next.length)
      }
      setCaret(next.length)
      if (imagePaths.length > 0) {
        attachResolvedPaths([...imagePaths])
      }
      focus()
    },
    [attachResolvedPaths, reply?.draft, focus, isComposing, setCaret, setDraft, textareaRef]
  )

  useImperativeHandle(
    ref,
    () => ({
      insertAgentReferences: (references) => {
        const input = textareaRef.current
        if (!input || input.disabled || !input.insertAgentReferences || isComposing()) {
          return false
        }
        input.insertAgentReferences(references)
        input.focus()
        return true
      },
      isComposing,
      focus,
      resend,
      insertTypedText,
      insertPastedText: insertPastedTextOrFile,
      acceptsText,
      appendText,
      handlePasteEvent,
      pasteFromClipboard,
      contains,
      sendReply,
      restoreDraft
    }),
    [
      textareaRef,
      isComposing,
      focus,
      resend,
      insertTypedText,
      insertPastedTextOrFile,
      acceptsText,
      appendText,
      handlePasteEvent,
      pasteFromClipboard,
      contains,
      sendReply,
      restoreDraft
    ]
  )
  return handlePasteEvent
}
