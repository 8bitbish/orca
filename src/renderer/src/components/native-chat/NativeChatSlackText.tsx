import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import CommentMarkdown from '@/components/sidebar/CommentMarkdown'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import {
  slackMrkdwnToMarkdown,
  type SlackMrkdwnMarkdownOptions
} from '../../../../shared/native-chat-slack-mrkdwn'
import { renderNativeChatLink } from './NativeChatProjectChip'

/**
 * Slack mrkdwn drawn as the chat's markdown, so mentions become Slack chips. The
 * conversion escapes everything but its few marks, so the text cannot inject a
 * link, HTML or a card. `clamp` shows three lines with a more/less toggle.
 */
export function NativeChatSlackText({
  text,
  options,
  clamp = false
}: {
  text: string
  options: SlackMrkdwnMarkdownOptions
  clamp?: boolean
}): React.JSX.Element {
  const markdown = useMemo(() => slackMrkdwnToMarkdown(text, options), [options, text])
  const [expanded, setExpanded] = useState(false)
  const [overflows, setOverflows] = useState(false)
  const bodyRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const body = bodyRef.current
    if (!clamp || expanded || !body) {
      return
    }
    const measure = (): void => setOverflows(body.scrollHeight > body.clientHeight + 1)
    measure()
    if (typeof ResizeObserver === 'undefined') {
      return
    }
    const observer = new ResizeObserver(measure)
    observer.observe(body)
    return () => observer.disconnect()
  }, [clamp, expanded, markdown])
  const collapsed = clamp && !expanded
  return (
    <div data-slack-text={collapsed ? 'collapsed' : 'expanded'} className="min-w-0">
      <div
        ref={bodyRef}
        className={cn('min-w-0 break-words text-sm leading-5', collapsed && 'line-clamp-3')}
      >
        <CommentMarkdown
          content={markdown}
          variant="document"
          renderChatLink={renderNativeChatLink}
        />
      </div>
      {clamp && (overflows || expanded) ? (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
          className="mt-0.5 rounded-sm text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {expanded
            ? translate('components.native-chat.slack.less', 'less ▴')
            : translate('components.native-chat.slack.more', 'more ▾')}
        </button>
      ) : null}
    </div>
  )
}
