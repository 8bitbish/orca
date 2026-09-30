import { useId } from 'react'
import { ChevronRight } from 'lucide-react'
import CommentMarkdown, {
  type CommentMarkdownLinkClickHandler
} from '@/components/sidebar/CommentMarkdown'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { formatNativeChatDuration } from '../../../../shared/native-chat-turn-status'
import { useNativeChatDisclosure } from './native-chat-disclosure-store'
import { NativeChatCodeBlock } from './NativeChatCodeBlock'

/** The label a reasoning row folds to. A duration appears only when one was derived. */
export function nativeChatThoughtLabel(live: boolean, seconds: number | null): string {
  if (live) {
    return translate('components.native-chat.thought.thinking', 'Thinking…')
  }
  return seconds === null
    ? translate('components.native-chat.thought.thought', 'Thought')
    : translate('components.native-chat.thought.thoughtFor', 'Thought for {{value0}}', {
        value0: formatNativeChatDuration(seconds)
      })
}

/**
 * The model's reasoning as one line — "Thinking…" while it is the turn's newest
 * output, "Thought for Ns" once the turn moves on — that opens to the full text.
 * Open state lives in the transcript's disclosure store so windowing cannot
 * re-collapse a thought the reader opened.
 */
export function NativeChatThoughtRow({
  messageId,
  markdown,
  live,
  seconds,
  onLinkClick,
  allowFileUriLinks
}: {
  messageId: string
  markdown: string
  live: boolean
  seconds: number | null
  onLinkClick?: CommentMarkdownLinkClickHandler
  allowFileUriLinks: boolean
}): React.JSX.Element {
  const { open, setOpen } = useNativeChatDisclosure(`thought:${messageId}`, false)
  const bodyId = useId()
  return (
    <div data-native-chat-thought={live ? 'live' : 'settled'}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={open ? bodyId : undefined}
        className="group/thought flex min-h-6 w-full items-center gap-1.5 rounded-md py-0.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70"
      >
        <span
          className={cn(
            'truncate text-sm leading-relaxed transition-colors',
            live
              ? 'animate-pulse text-foreground/85 motion-reduce:animate-none'
              : 'text-muted-foreground group-hover/thought:text-foreground/80'
          )}
        >
          {nativeChatThoughtLabel(live, seconds)}
        </span>
        <ChevronRight
          aria-hidden
          className={cn(
            'size-3.5 shrink-0 text-muted-foreground transition-all',
            open
              ? 'rotate-90'
              : 'can-hover:opacity-0 group-hover/thought:opacity-100 group-focus-visible/thought:opacity-100'
          )}
        />
      </button>
      {open ? (
        // Outside the toggle so the reasoning selects and copies like any prose.
        <div id={bodyId} className="mt-1 border-l-2 border-border/60 pl-3 text-muted-foreground">
          <CommentMarkdown
            content={markdown}
            variant="document"
            className="text-sm"
            renderCodeBlock={NativeChatCodeBlock}
            onLinkClick={onLinkClick}
            allowFileUriLinks={allowFileUriLinks}
            linkifyFilePaths={onLinkClick !== undefined}
          />
        </div>
      ) : null}
    </div>
  )
}
