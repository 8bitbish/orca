import { useCallback, useImperativeHandle, type ForwardedRef } from 'react'
import type { ClipboardEventLike } from './native-chat-clipboard-payload'
import type {
  NativeChatComposerHandle,
  NativeChatStructuredComposerTransport
} from './native-chat-composer-types'
import {
  useNativeChatComposerPaste,
  type UseNativeChatComposerPasteArgs
} from './use-native-chat-composer-paste'
import { useNativeChatTypedInsertion } from './use-native-chat-typed-insertion'
import type { NativeChatStructuredComposerSend } from './use-native-chat-structured-composer-send'
import { useNativeChatPastedTextFile } from './use-native-chat-pasted-text-file'
import {
  writeNativeChatComposerText,
  type NativeChatComposerInput
} from './native-chat-composer-input'

type UseNativeChatComposerHandleArgs = Parameters<typeof useNativeChatTypedInsertion>[0] &
  Omit<UseNativeChatComposerPasteArgs, 'insertTypedText' | 'targetKey'> & {
    paneKey: string | null | undefined
    targetPtyId: string | null | undefined
    /** A structured chat's editor while it shows this scope, where a long paste saved as a file lands. */
    pastedTextEditor: (() => NativeChatComposerInput | null) | null
    /** The draft a restored queued message is appended to. */
    draft: string
    sendPty: (reply?: string) => boolean
    /** A card's reply goes straight out and leaves the draft. */
    sendStructured: NativeChatStructuredComposerSend
    structuredTransport: NativeChatStructuredComposerTransport | undefined
  }

/** What a paste in flight belongs to; a different pane, PTY or session drops it. */
function nativeChatComposerTargetKey(
  paneKey: string | null | undefined,
  targetPtyId: string | null | undefined,
  transport: NativeChatStructuredComposerTransport | undefined
): string {
  return JSON.stringify([
    paneKey,
    targetPtyId,
    transport?.sessionId,
    transport?.worktreeId,
    transport?.runtimeEnvironmentId
  ])
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
    draft,
    setDraft,
    setActiveSuggestion,
    sendPty,
    sendStructured,
    structuredTransport,
    pastedTextEditor,
    paneKey,
    targetPtyId,
    ...pasteArgs
  } = args
  const { disabled, attachResolvedPaths, setCaret } = pasteArgs
  const { insertTypedText, appendText, acceptsText, insertPastedText, focus, contains } =
    useNativeChatTypedInsertion({
      textareaRef,
      isComposing,
      setDraft,
      setCaret,
      setActiveSuggestion
    })

  const insertPastedTextOrFile = useNativeChatPastedTextFile({
    scopeKey: args.attachmentScopeKey ?? '',
    // Without a draft scope there is no draft for a pending paste to settle in.
    scopeEditor: args.attachmentScopeKey ? pastedTextEditor : null,
    resolveAttachmentOwner: args.resolveAttachmentOwner,
    insertTypedText: insertPastedText,
    setNotice: args.setNotice
  })
  const { handlePaste: handlePasteEvent, pasteFromClipboard } = useNativeChatComposerPaste({
    ...pasteArgs,
    targetKey: nativeChatComposerTargetKey(paneKey, targetPtyId, structuredTransport),
    insertTypedText: insertPastedTextOrFile
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
      void sendStructured(text, [], { keepDraft: true })
      return true
    },
    [disabled, sendPty, sendStructured, structuredTransport]
  )
  const restoreDraft = useCallback(
    (text: string, imagePaths: readonly string[]) => {
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
    [attachResolvedPaths, draft, focus, isComposing, setCaret, setDraft, textareaRef]
  )

  useImperativeHandle(
    ref,
    () => ({
      isComposing,
      focus,
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
      isComposing,
      focus,
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
