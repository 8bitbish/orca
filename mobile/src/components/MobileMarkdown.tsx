import { memo, useContext, type ReactNode } from 'react'
import { View } from 'react-native'
import { MARKDOWN_TONES, scaledMarkdownText, styles } from './mobile-markdown-styles'
import { renderBlocks, type MarkdownBlockContext } from './mobile-markdown-blocks'
import {
  MarkdownProseSizeContext,
  MarkdownSelectableContext,
  MarkdownText
} from './mobile-markdown-text'
import { MarkdownTextContext } from './mobile-markdown-text-setup'
import { useMobileMarkdownTree } from './use-mobile-markdown-tree'
import { useMarkdownTextSetup } from './use-markdown-text-setup'
import { MobileMarkdownRenderersContext } from './mobile-markdown-renderers'
import type { NativeChatVisualDirective } from '../../../src/shared/native-chat-visual-directive'

type Props = {
  content?: string
  fallback?: string
  /** Enables iOS range selection for native-chat transcript prose. */
  rangeSelectable?: boolean
  /** Forward long presses from interactive Android transcript spans to the message. */
  onLongPress?: () => void
  /** Multiplier for every text size. Defaults to 1; the chat view passes >1 so its prose reads
   *  larger than the compact base. */
  textScale?: number
  // File targets call this with relative/absolute path and optional :line(:col); omit on screens without viewer to leave paths plain.
  onOpenFile?: (pathText: string) => void
  // Draws closed ```html / ```svg / ```widget fences live; set for agent replies only.
  markupPreviews?: boolean
  // False disables text selection in this block (Android transcript drags would otherwise start a selection).
  selectable?: boolean
  // Enable ::orca-visual directives only in assistant native-chat prose; keep callback identity stable for memoization.
  renderImage?: (href: string, alt: string) => ReactNode
  renderVisual?: (directive: NativeChatVisualDirective, index: number) => ReactNode
  // Close incomplete streaming markup like desktop; diagrams remain code until text stops.
  growing?: boolean
  /** The surface under the text: `onBright` for your own message's light fill. */
  tone?: keyof typeof MARKDOWN_TONES
}

function MobileMarkdownContent({
  content,
  fallback = '',
  rangeSelectable = false,
  textScale = 1,
  onOpenFile,
  markupPreviews = false,
  renderVisual,
  renderImage,
  growing = false,
  tone: toneName = 'default'
}: Props) {
  const renderers = useContext(MobileMarkdownRenderersContext)
  // Interactive children own their touches and must forward the row action.
  const setup = useContext(MarkdownTextContext)
  const text = content?.trim() ?? ''
  const { root, directives } = useMobileMarkdownTree(text, renderVisual !== undefined, growing)
  if (!text) {
    return fallback ? (
      <MarkdownText selectable={rangeSelectable} style={styles.paragraph}>
        {fallback}
      </MarkdownText>
    ) : null
  }
  const tone = MARKDOWN_TONES[toneName]
  const ctx: MarkdownBlockContext = {
    growing,
    onOpenFile,
    tone,
    textScale,
    // Zoomed list text has read a size above the sheet's since it first scaled; kept as it was.
    listText: [
      styles.listText,
      scaledMarkdownText({ fontSize: 14, lineHeight: 20 }, textScale),
      tone.text
    ],
    rowLongPress: setup.androidTranscript ? setup.onLongPress : undefined,
    directives,
    renderVisual,
    renderImage,
    mermaidOccurrences: new Map(),
    markupPreviews,
    markupOccurrences: new Map(),
    renderFence: renderers.renderFence,
    renderLink: renderers.renderLink
  }
  // Native-chat range selection is set on each block; nested inline spans inherit it.
  return (
    <View style={styles.root}>
      {renderBlocks(root.children, ctx, {
        style: [styles.paragraph, scaledMarkdownText(styles.paragraph, textScale), tone.text],
        selectable: rangeSelectable
      })}
    </View>
  )
}

function MobileMarkdownInner(props: Props): React.JSX.Element | null {
  const setup = useMarkdownTextSetup(props.rangeSelectable ?? false, props.onLongPress)
  return (
    <MarkdownTextContext.Provider value={setup}>
      <MarkdownSelectableContext.Provider value={props.selectable !== false}>
        <MarkdownProseSizeContext.Provider value={13 * (props.textScale ?? 1)}>
          <MobileMarkdownContent {...props} />
        </MarkdownProseSizeContext.Provider>
      </MarkdownSelectableContext.Provider>
    </MarkdownTextContext.Provider>
  )
}

export const MobileMarkdown = memo(MobileMarkdownInner)
