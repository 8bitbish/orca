import React, { useContext } from 'react'
import { Code2 } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { getCodeBlockLanguageLabel } from '@/components/editor/rich-markdown-code-block-languages'
import { NativeChatCopyButton } from './NativeChatCopyButton'
import { NativeChatDiagramCard } from './NativeChatDiagramCard'
import { NativeChatMarkupPreview } from './NativeChatMarkupPreview'
import { NativeChatMermaidDiagram } from './NativeChatMermaidDiagram'
import { NativeChatWidgetCard } from './NativeChatWidgetCard'
import { NativeChatProjectCard } from './NativeChatProjectCard'
import { NativeChatShellRunBlock } from './NativeChatShellRunBlock'
import { NativeChatSlackDraftCard } from './NativeChatSlackDraftCard'
import { NativeChatSlackMessageCard } from './NativeChatSlackMessageCard'
import { NativeChatFencePreviewContext, nativeChatFenceRoute } from './native-chat-fence-preview'
import { NativeChatShellRunContext } from './native-chat-shell-run-workspace'

/** Code fences need their own copy target rather than the whole chat message.
 *  Finished mermaid fences, and html/svg/widget fences in a reply, render as diagrams;
 *  a finished project-card fence in a reply renders as a live project card, and a
 *  slack-message or slack-draft fence as a Slack card; a finished
 *  shell fence in the agent's reply gets a Run button when the chat can run it. */
export function NativeChatCodeBlock({
  children,
  language
}: {
  children?: React.ReactNode
  language?: string
}): React.JSX.Element {
  const code = extractCodeText(children)
  const scope = useContext(NativeChatFencePreviewContext)
  const canRun = useContext(NativeChatShellRunContext) !== null
  const route = nativeChatFenceRoute({
    language,
    code,
    scope: canRun ? scope : { ...scope, shellRuns: false }
  })

  if (route === 'mermaid') {
    return (
      <NativeChatDiagramCard kind="mermaid" label={getCodeBlockLanguageLabel(route)} source={code}>
        <NativeChatMermaidDiagram source={code.trimEnd()} />
      </NativeChatDiagramCard>
    )
  }
  if (route === 'project-card') {
    return (
      <NativeChatProjectCard
        source={code}
        fallback={<NativeChatPlainCodeBlock language={language} code={code} body={children} />}
      />
    )
  }
  if (route === 'slack-message' || route === 'slack-draft') {
    const SlackCard =
      route === 'slack-message' ? NativeChatSlackMessageCard : NativeChatSlackDraftCard
    return (
      <SlackCard
        source={code}
        fallback={<NativeChatPlainCodeBlock language={language} code={code} body={children} />}
      />
    )
  }
  if (route === 'shell-run') {
    return <NativeChatShellRunBlock language={language} code={code} body={children} />
  }
  if (route === 'widget') {
    return (
      <NativeChatWidgetCard source={code}>
        <NativeChatMarkupPreview source={code} kind="widget" />
      </NativeChatWidgetCard>
    )
  }
  if (route === 'html' || route === 'svg') {
    return (
      <NativeChatDiagramCard
        kind={route}
        // No catalog entry for svg; the format name reads the same in every locale.
        label={route === 'html' ? getCodeBlockLanguageLabel(route) : route.toUpperCase()}
        source={code}
      >
        <NativeChatMarkupPreview source={code} kind={route} />
      </NativeChatDiagramCard>
    )
  }

  // A mermaid fence still streaming shows its text: its <code> child would render the diagram.
  const body = language?.toLowerCase() === 'mermaid' ? <code>{code}</code> : children
  return <NativeChatPlainCodeBlock language={language} code={code} body={body} />
}

/** The fence as source: a language header with a copy button, then the code. */
function NativeChatPlainCodeBlock({
  language,
  code,
  body
}: {
  language?: string
  code: string
  body: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="group/code relative my-3 min-w-0 max-w-full overflow-hidden rounded-md bg-accent">
      {language ? (
        <div className="flex h-9 items-center justify-between border-b border-border/60 px-3">
          <span
            data-code-language={language}
            className="flex min-w-0 items-center gap-1.5 font-mono text-[11px] text-muted-foreground"
          >
            <Code2 className="size-3.5 shrink-0" />
            <span className="truncate">{getCodeBlockLanguageLabel(language)}</span>
          </span>
          {code ? (
            <NativeChatCopyButton
              text={code}
              label={translate('components.native-chat.copyCode', 'Copy code')}
              className="-mr-1"
            />
          ) : null}
        </div>
      ) : null}
      <pre
        className={cn(
          'scrollbar-sleek m-0 max-h-80 max-w-full overflow-x-auto p-3 font-mono text-[12px]',
          !language && 'pr-10'
        )}
      >
        {body}
      </pre>
      {code && !language ? (
        <NativeChatCopyButton
          text={code}
          label={translate('components.native-chat.copyCode', 'Copy code')}
          className="absolute right-2 top-2 opacity-100 transition-opacity can-hover:pointer-events-none can-hover:opacity-0 group-hover/code:pointer-events-auto group-hover/code:opacity-100 [[class~='group/code']:has(:focus-visible)_&]:pointer-events-auto [[class~='group/code']:has(:focus-visible)_&]:opacity-100"
        />
      ) : null}
    </div>
  )
}

function extractCodeText(node: React.ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node)
  }
  if (Array.isArray(node)) {
    return node.map(extractCodeText).join('')
  }
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
    return extractCodeText(node.props.children)
  }
  return ''
}
