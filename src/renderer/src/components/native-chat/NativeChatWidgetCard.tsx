import { useId, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { NativeChatCopyButton } from './NativeChatCopyButton'

/**
 * A ```widget fence, framed the way Claude.ai frames its inline visuals: a quiet
 * "Widget" line whose chevron reveals the source, and the visual on a soft
 * rounded surface with no code-block chrome. The disclosure mirrors the thought
 * row's so the two read as siblings.
 */
export function NativeChatWidgetCard({
  source,
  children
}: {
  source: string
  /** The rendered widget. */
  children: React.ReactNode
}): React.JSX.Element {
  const [showSource, setShowSource] = useState(false)
  const sourceId = useId()
  return (
    <figure data-native-chat-diagram="widget" className="my-3 min-w-0 max-w-full">
      <div className="mb-1.5 flex min-h-6 items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setShowSource(!showSource)}
          aria-expanded={showSource}
          aria-controls={showSource ? sourceId : undefined}
          className="group/widget flex min-w-0 items-center gap-1.5 rounded-md py-0.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
        >
          <span className="truncate text-sm leading-relaxed text-muted-foreground transition-colors group-hover/widget:text-foreground/80">
            {translate('components.native-chat.diagram.widgetLabel', 'Widget')}
          </span>
          <ChevronRight
            aria-hidden
            className={cn(
              'size-3.5 shrink-0 text-muted-foreground transition-transform',
              showSource && 'rotate-90'
            )}
          />
        </button>
        <NativeChatCopyButton
          text={source}
          label={translate('components.native-chat.diagram.copyWidget', 'Copy widget source')}
        />
      </div>
      {showSource ? (
        <pre
          id={sourceId}
          className="scrollbar-sleek mb-2 mt-0 max-h-80 max-w-full overflow-x-auto rounded-md bg-accent p-3 font-mono text-[12px]"
        >
          <code>{source}</code>
        </pre>
      ) : null}
      <div className="overflow-hidden rounded-xl border border-border/60 bg-card">{children}</div>
    </figure>
  )
}
