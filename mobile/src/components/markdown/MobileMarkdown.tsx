import { memo, useContext, type ReactNode } from 'react'
import { View } from 'react-native'
import { MARKDOWN_TONES, scaledMarkdownText, styles } from './mobile-markdown-styles'
import { useMobileColorScheme } from '../../theme/use-mobile-color-scheme'
import { renderBlocks, type MarkdownBlockContext } from './blocks/mobile-markdown-blocks'
import {
  MarkdownProseSizeContext,
  MarkdownSelectableContext,
  MarkdownText
} from './mobile-markdown-text'
import { MobileMarkdownRemoteImage } from './blocks/MobileMarkdownRemoteImage'
import { MarkdownTextContext } from './mobile-markdown-text-setup'
import { MarkdownLinkHandlerContext } from './links/markdown-link-handler'
import { useMobileMarkdownTree } from './parsing/use-mobile-markdown-tree'
import { useMarkdownTextSetup } from '../use-markdown-text-setup'
import { MobileMarkdownRenderersContext } from '../mobile-markdown-renderers'
import { MobileMarkdownSlackPeopleContext } from './parsing/mobile-markdown-mentions'
import {
  MobileMarkdownLinksContext,
  useNativeChatFileLinkExistsFrom
} from './links/mobile-markdown-links-context'
import type { NativeChatVisualDirective } from '../../../../src/shared/native-chat/visuals/native-chat-visual-directive'

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
  /** Multiplies the prose's line heights; code keeps its own. */
  lineSpacing?: number
  /** The prose's face; code keeps mono. */
  fontFamily?: string
  // File targets call this with relative/absolute path and optional :line(:col); omit on screens without viewer to leave paths plain.
  onOpenFile?: (pathText: string) => void
  // Draws closed ```html / ```svg / ```widget fences live; set for agent replies only.
  markupPreviews?: boolean
  // False disables text selection in this block (Android transcript drags would otherwise start a selection).
  selectable?: boolean
  // Enable ::orca-visual directives only in assistant native-chat prose; keep callback identity stable for memoization.
  renderImage?: (href: string, alt: string, width?: number) => ReactNode
  renderVisual?: (directive: NativeChatVisualDirective, index: number) => ReactNode
  // Close incomplete streaming markup like desktop; diagrams remain code until text stops.
  growing?: boolean
  /** The text may end mid-path: chat file links show only answers already known. */
  streaming?: boolean
  /** Chat's math delimiters, `\(…\)` and `\[…\]` as well as `$`, as desktop chat reads them.
   *  GitHub text (PRs, Tasks, files) leaves them off, so `\[Bug\]` stays a bracket. */
  chatMath?: boolean
  /** The surface under the text: `userMessage` inside your own message's bubble. */
  tone?: keyof typeof MARKDOWN_TONES
  /** The content is a Slack message's drawn form: its mention links draw as mentions. */
  slackMentions?: boolean
}

/** Without a surface's own image renderer, https images draw from the web (GitHub text). */
function renderRemoteImage(href: string, alt: string, width?: number): ReactNode {
  return /^https:\/\//i.test(href) ? (
    <MobileMarkdownRemoteImage uri={href} alt={alt} width={width} />
  ) : null
}

function MobileMarkdownContent({
  content,
  fallback = '',
  rangeSelectable = false,
  textScale = 1,
  lineSpacing = 1,
  fontFamily,
  onOpenFile,
  markupPreviews = false,
  renderVisual,
  renderImage,
  growing = false,
  streaming = false,
  chatMath = false,
  tone: toneName = 'default',
  slackMentions = false
}: Props) {
  const renderers = useContext(MobileMarkdownRenderersContext)
  useMobileColorScheme()
  // Interactive children own their touches and must forward the row action.
  const setup = useContext(MarkdownTextContext)
  const onOpenLink = useContext(MarkdownLinkHandlerContext)
  const links = useContext(MobileMarkdownLinksContext)
  const slackPeople = useContext(MobileMarkdownSlackPeopleContext)
  const fileLinkExists = useNativeChatFileLinkExistsFrom(
    links?.fileLinks ?? null,
    onOpenFile !== undefined,
    streaming
  )
  const text = content?.trim() ?? ''
  const { root, directives, cards } = useMobileMarkdownTree(
    text,
    renderVisual !== undefined,
    growing,
    chatMath,
    {
      fileLinkExists,
      githubRepo: links?.githubRepo,
      slackMentions,
      slackPeople
    }
  )
  if (!text) {
    return fallback ? (
      <MarkdownText selectable={rangeSelectable} style={styles.paragraph}>
        {fallback}
      </MarkdownText>
    ) : null
  }
  const tone = MARKDOWN_TONES[toneName]
  const face = fontFamily ? { fontFamily } : null
  const ctx: MarkdownBlockContext = {
    growing,
    chatMath,
    onOpenFile,
    onOpenLink,
    filePathsLinkedInTree: fileLinkExists !== undefined,
    tone,
    textScale,
    lineSpacing,
    fontFamily,
    listText: [
      styles.listText,
      scaledMarkdownText(styles.listText, textScale, lineSpacing),
      face,
      tone.text
    ],
    listMarker: [
      styles.listMarker,
      scaledMarkdownText(styles.listMarker, textScale, lineSpacing),
      tone.secondary
    ],
    rowLongPress: setup.androidTranscript ? setup.onLongPress : undefined,
    directives,
    cards,
    renderVisual,
    renderImage: renderImage ?? renderRemoteImage,
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
        style: [
          styles.paragraph,
          scaledMarkdownText(styles.paragraph, textScale, lineSpacing),
          face,
          tone.text
        ],
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
