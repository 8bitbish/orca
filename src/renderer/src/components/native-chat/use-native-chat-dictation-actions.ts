import type { NativeChatComposerInput } from './native-chat-composer-input'
import { useCallback, useState, type RefObject } from 'react'
import { useAppStore } from '../../store'
import { dispatchDictationControl } from '../dictation/dictation-control-events'

/** The composer's dictation controls and the state its mic button shows. */
export function useNativeChatDictationActions(args: {
  textareaRef: RefObject<NativeChatComposerInput | null>
}): {
  toggleDictation: () => void
  startHoldDictation: () => void
  stopHoldDictation: () => void
  isDictating: boolean
  dictationDisabled: boolean
  isDictationHoldMode: boolean
} {
  const { textareaRef } = args
  const [dictationPressed, setDictationPressed] = useState(false)
  const dictationState = useAppStore((store) => store.dictationState)
  const voiceSettings = useAppStore((store) => store.settings?.voice)
  const dictationDisabled = voiceSettings?.enabled !== true || !voiceSettings.sttModel
  const isDictating =
    dictationPressed ||
    dictationState === 'starting' ||
    dictationState === 'listening' ||
    dictationState === 'stopping'
  const focusForDictation = useCallback(() => textareaRef.current?.focus(), [textareaRef])
  const toggleDictation = useCallback(() => {
    focusForDictation()
    dispatchDictationControl('toggle')
  }, [focusForDictation])
  const startHoldDictation = useCallback(() => {
    setDictationPressed(true)
    focusForDictation()
    dispatchDictationControl('start')
  }, [focusForDictation, setDictationPressed])
  const stopHoldDictation = useCallback(() => {
    setDictationPressed(false)
    dispatchDictationControl('stop')
  }, [setDictationPressed])
  return {
    toggleDictation,
    startHoldDictation,
    stopHoldDictation,
    isDictating,
    dictationDisabled,
    isDictationHoldMode: voiceSettings?.dictationMode === 'hold'
  }
}
