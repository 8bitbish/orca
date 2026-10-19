import { useMemo } from 'react'
import { Text as NativeText } from 'react-native'
import { INLINE_TEXT_SELECTION } from './inline-text-selection'
import type { MarkdownTextSetup } from './mobile-markdown-text-setup'

export function useMarkdownTextSetup(
  rangeSelectable: boolean,
  onLongPress: (() => void) | undefined
): MarkdownTextSetup {
  // Other Markdown surfaces retain their existing selection behavior.
  const androidTranscript = rangeSelectable && !INLINE_TEXT_SELECTION
  return useMemo(
    () => ({
      TextComponent: NativeText,
      androidTranscript,
      ...(onLongPress ? { onLongPress } : {})
    }),
    [rangeSelectable, androidTranscript, onLongPress]
  )
}
