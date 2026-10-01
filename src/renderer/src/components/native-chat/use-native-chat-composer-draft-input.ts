import { useCallback, type Dispatch, type SetStateAction } from 'react'
import type { NativeChatComposerInput } from './native-chat-composer-input'
import type { HistoryState } from './native-chat-composer-state'

/** The composer field's edit, selection and IME-settle handlers, which all resync the picker. */
export function useNativeChatComposerDraftInput(args: {
  draft: string
  setDraft: (value: string) => void
  setCaret: Dispatch<SetStateAction<number>>
  setHistory: Dispatch<SetStateAction<HistoryState>>
  setActiveSuggestion: Dispatch<SetStateAction<number>>
  handleDraftOrCaretChange: (value: string, caret: number) => void
  flushDraftAppends: () => void
  flushPendingAttachments: () => void
}): {
  handleDraftChange: (value: string, element: NativeChatComposerInput) => void
  handleTextareaSelect: (element: NativeChatComposerInput) => void
  handleImeSettled: (element: NativeChatComposerInput) => void
} {
  const { draft, flushDraftAppends, flushPendingAttachments, handleDraftOrCaretChange } = args
  const { setActiveSuggestion, setCaret, setDraft, setHistory } = args
  const handleDraftChange = useCallback(
    (value: string, element: NativeChatComposerInput) => {
      setDraft(value)
      setHistory((prev) => ({ entries: prev.entries, index: null }))
      setCaret(element.selectionStart ?? element.value.length)
      handleDraftOrCaretChange(value, element.selectionStart ?? value.length)
      setActiveSuggestion(0)
    },
    [handleDraftOrCaretChange, setActiveSuggestion, setCaret, setDraft, setHistory]
  )
  const handleTextareaSelect = useCallback(
    (element: NativeChatComposerInput) => {
      setCaret(element.selectionStart ?? element.value.length)
      handleDraftOrCaretChange(element.value, element.selectionStart ?? element.value.length)
      setActiveSuggestion(0)
    },
    [handleDraftOrCaretChange, setActiveSuggestion, setCaret]
  )
  const handleImeSettled = useCallback(
    (element: NativeChatComposerInput) => {
      if (element.value !== draft) {
        handleDraftChange(element.value, element)
      }
      flushDraftAppends()
      flushPendingAttachments()
    },
    [draft, flushDraftAppends, flushPendingAttachments, handleDraftChange]
  )
  return { handleDraftChange, handleTextareaSelect, handleImeSettled }
}
