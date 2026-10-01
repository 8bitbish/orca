import { createContext, createElement, useContext, type ComponentType } from 'react'
import { Text as NativeText, type TextProps } from 'react-native'

/** The Text a Markdown block draws with (iOS range selection swaps it). */
export const MarkdownTextContext = createContext<ComponentType<TextProps>>(NativeText)
/** False turns selection off for every run in the block, whatever the run asks for. */
export const MarkdownSelectableContext = createContext(true)

export function MarkdownText(props: TextProps): React.JSX.Element {
  const TextComponent = useContext(MarkdownTextContext)
  const selectable = useContext(MarkdownSelectableContext)
  return createElement(TextComponent, selectable ? props : { ...props, selectable: false })
}
