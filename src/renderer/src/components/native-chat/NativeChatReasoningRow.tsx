import { useContext } from 'react'
import type { CommentMarkdownLinkClickHandler } from '@/components/sidebar/CommentMarkdown'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { translate } from '@/i18n/i18n'
import type { NativeChatMessage } from '../../../../shared/native-chat-types'
import { isNativeChatThoughtMarker } from '../../../../shared/native-chat-thought-marker'
import {
  nativeChatReasoningDisclosureKey,
  nativeChatReasoningHeadline,
  type NativeChatReasoningHeadline
} from '../../../../shared/native-chat-reasoning-row'
import {
  NativeChatReasoningBody,
  NativeChatReasoningChevron
} from './NativeChatReasoningDisclosure'
import { NativeChatToolRunIcon } from './NativeChatToolIcon'
import { useNativeChatDisclosure } from './native-chat-disclosure-store'
import {
  NativeChatThoughtTimingContext,
  nativeChatReasoningHeadlineWithFallback
} from './native-chat-thought-markers'

function translatedHeadline(headline: NativeChatReasoningHeadline): string {
  if (headline.kind === 'thoughtFor') {
    return translate('components.native-chat.thoughtForDuration', 'Thought for {{duration}}', {
      duration: headline.duration
    })
  }
  return headline.kind === 'thought'
    ? translate('components.native-chat.thought', 'Thought')
    : translate('components.native-chat.reasoning', 'Reasoning')
}

export function NativeChatReasoningRow({
  message,
  markdown,
  turnIsWorking = false,
  onLinkClick,
  allowFileUriLinks
}: {
  message: Pick<NativeChatMessage, 'id' | 'role' | 'state' | 'completedAt' | 'timestamp'> &
    Partial<Pick<NativeChatMessage, 'blocks'>>
  markdown: string
  /** The row's own turn (or subagent) is still running; an open row there has not ended. */
  turnIsWorking?: boolean
  onLinkClick?: CommentMarkdownLinkClickHandler
  allowFileUriLinks?: boolean
}): React.JSX.Element | null {
  // Keyed like the live line, so a block opened while it streamed lands open, and windowing keeps it.
  const disclosureKey = nativeChatReasoningDisclosureKey(message.id)
  const disclosure = useNativeChatDisclosure(disclosureKey, false)
  const timing = useContext(NativeChatThoughtTimingContext)
  const { blocks } = message
  const isMarker = blocks !== undefined && isNativeChatThoughtMarker({ role: message.role, blocks })
  if ((!markdown.trim() && !isMarker) || timing.merged.has(message.id)) {
    return null
  }
  const label = translate('components.native-chat.reasoning', 'Reasoning')
  const headline = translatedHeadline(
    nativeChatReasoningHeadlineWithFallback(
      nativeChatReasoningHeadline(message, { live: turnIsWorking }),
      timing.seconds.get(message.id),
      isMarker
    )
  )
  if (isMarker) {
    // The provider recorded that it thought, not what: one line, nothing to open.
    return (
      <div
        data-native-chat-thought-marker=""
        className="flex min-h-6 min-w-0 items-center gap-1.5 py-0.5 text-sm text-chat-foreground-faint"
      >
        <NativeChatToolRunIcon iconName="brain" className="text-chat-foreground-faint" />
        <span className="min-w-0 truncate text-sm leading-relaxed text-chat-foreground-faint">
          {headline}
        </span>
      </div>
    )
  }

  return (
    <div className="min-w-0 text-sm text-chat-foreground-faint">
      <Collapsible open={disclosure.open} onOpenChange={disclosure.setOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="group/reasoning flex min-h-6 w-full min-w-0 items-center gap-1.5 rounded-md py-0.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            {headline === label ? null : <span className="sr-only">{label}: </span>}
            <NativeChatToolRunIcon iconName="brain" className="text-chat-foreground-faint" />
            <span className="min-w-0 truncate text-sm leading-relaxed text-chat-foreground-faint transition-colors group-hover/reasoning:text-chat-foreground">
              {headline}
            </span>
            <NativeChatReasoningChevron />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent animation="height" data-native-chat-member-detail>
          <NativeChatReasoningBody
            rowKey={disclosureKey}
            markdown={markdown}
            onLinkClick={onLinkClick}
            allowFileUriLinks={allowFileUriLinks}
          />
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}
