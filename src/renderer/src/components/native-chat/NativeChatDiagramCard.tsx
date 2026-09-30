import { useState } from 'react'
import { Code2, Shapes } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { NativeChatCopyButton } from './NativeChatCopyButton'

/**
 * The frame a rendered fence sits in: the same header strip as a code block, so
 * a diagram reads as a sibling of the code around it, with a toggle to its
 * source and a copy of that source.
 */
export function NativeChatDiagramCard({
  kind,
  label,
  source,
  children
}: {
  kind: 'mermaid' | 'html' | 'svg'
  label: string
  source: string
  /** The rendered diagram. */
  children: React.ReactNode
}): React.JSX.Element {
  const [showSource, setShowSource] = useState(false)
  return (
    <figure
      data-native-chat-diagram={kind}
      className="my-3 min-w-0 max-w-full overflow-hidden rounded-md border border-border/60 bg-card"
    >
      <div className="flex h-9 items-center justify-between gap-2 border-b border-border/60 bg-accent px-3">
        <span className="flex min-w-0 items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
          <Shapes className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">{label}</span>
        </span>
        <div className="-mr-1 flex shrink-0 items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            aria-pressed={showSource}
            onClick={() => setShowSource(!showSource)}
          >
            <Code2 aria-hidden />
            {translate('components.native-chat.diagram.showSource', 'Code')}
          </Button>
          <NativeChatCopyButton
            text={source}
            label={translate('components.native-chat.copyCode', 'Copy code')}
          />
        </div>
      </div>
      {showSource ? (
        <pre className="scrollbar-sleek m-0 max-h-80 max-w-full overflow-x-auto bg-accent p-3 font-mono text-[12px]">
          <code>{source}</code>
        </pre>
      ) : (
        children
      )}
    </figure>
  )
}
