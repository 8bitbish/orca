import { createContext, createElement, useContext } from 'react'
import type { TextProps } from 'react-native'
import { MarkdownTextContext } from './mobile-markdown-text-setup'

/** False turns selection off for every run in the block, whatever the run asks for. */
export const MarkdownSelectableContext = createContext(true)

export function MarkdownText(props: TextProps): React.JSX.Element {
  const { TextComponent, androidTranscript, onLongPress } = useContext(MarkdownTextContext)
  const selectable = useContext(MarkdownSelectableContext)
  const selectionOff = !selectable || (androidTranscript && props.selectable === true)
  if (!selectionOff && !androidTranscript) {
    return createElement(TextComponent, props)
  }
  // Override selection without changing the nested spans' inherited behavior.
  return createElement(TextComponent, {
    ...props,
    ...(selectionOff ? { selectable: false } : {}),
    ...(androidTranscript && onLongPress && props.onPress ? { onLongPress } : {})
  })
}

/** The prose font size around an inline element, which Android does not pass into a View
 *  nested in text; inline pills size themselves from it. */
export const MarkdownProseSizeContext = createContext(14)

/** How far to lower an inline view of `height` so it centres on prose of `proseSize`:
 *  Android seats an inline view's bottom on the baseline, and the text's visual middle
 *  sits about 0.36em above it. */
export function inlineViewBaselineShift(height: number, proseSize: number): number {
  return Math.round(height / 2 - proseSize * 0.36)
}
