import React, { useContext } from 'react'
import { WrapText } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { getCodeFenceLanguageLabel } from './code-fence-language-label'
import { NativeChatCopyButton } from './NativeChatCopyButton'
import { NativeChatDiagramCard } from './NativeChatDiagramCard'
import { NativeChatMarkupPreview } from './NativeChatMarkupPreview'
import { NativeChatMermaidDiagram } from './NativeChatMermaidDiagram'
import { NativeChatWidgetCard } from './NativeChatWidgetCard'
import { NativeChatProjectCard } from './NativeChatProjectCard'
import { NativeChatProofCard } from './NativeChatProofCard'
import { NativeChatShellRunBlock } from './NativeChatShellRunBlock'
import { NativeChatSlackDraftCard } from './NativeChatSlackDraftCard'
import { NativeChatSlackMessageCard } from './NativeChatSlackMessageCard'
import { NativeChatFencePreviewContext, nativeChatFenceRoute } from './native-chat-fence-preview'
import { NativeChatShellRunContext } from './native-chat-shell-run-workspace'
import {
  NativeChatMarkdownRowKeyContext,
  useNativeChatDisclosure
} from './native-chat-disclosure-store'
import { NativeChatHighlightedCode } from './NativeChatHighlightedCode'

/** Code fences need their own copy target rather than the whole chat message.
 *  Finished mermaid fences, and html/svg/widget fences in a reply, render as diagrams;
 *  a finished project-card fence in a reply renders as a live project card, and a
 *  slack-message or slack-draft fence as a Slack card, a proof-card fence as a
 *  viewer of an agent's finished work; a finished
 *  shell fence in the agent's reply gets a Run button when the chat can run it. */
export function NativeChatCodeBlock({
  children,
  language,
  sourceLine,
  plain = false
}: {
  children?: React.ReactNode
  language?: string
  sourceLine?: number
  plain?: boolean
}): React.JSX.Element {
  const code = extractCodeText(children)
  const scope = useContext(NativeChatFencePreviewContext)
  const canRun = useContext(NativeChatShellRunContext) !== null
  const route = nativeChatFenceRoute({
    language,
    code,
    scope: canRun ? scope : { ...scope, shellRuns: false }
  })
  const source = (
    <NativeChatFenceSource
      language={language}
      code={code}
      body={children}
      sourceLine={sourceLine}
      plain={plain}
    />
  )

  if (route === 'mermaid') {
    return (
      <NativeChatDiagramCard kind="mermaid" label={getCodeFenceLanguageLabel(route)} source={code}>
        <NativeChatMermaidDiagram source={code.trimEnd()} />
      </NativeChatDiagramCard>
    )
  }
  if (route === 'project-card') {
    return <NativeChatProjectCard source={code} fallback={source} />
  }
  if (route === 'slack-message' || route === 'slack-draft') {
    const SlackCard =
      route === 'slack-message' ? NativeChatSlackMessageCard : NativeChatSlackDraftCard
    return <SlackCard source={code} fallback={source} />
  }
  if (route === 'proof-card') {
    return <NativeChatProofCard source={code} fallback={source} />
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
        label={route === 'html' ? getCodeFenceLanguageLabel(route) : route.toUpperCase()}
        source={code}
      >
        <NativeChatMarkupPreview source={code} kind={route} />
      </NativeChatDiagramCard>
    )
  }
  return source
}

/** The fence as source: a language header with wrap and copy buttons, then the code. */
function NativeChatFenceSource({
  language,
  code,
  body,
  sourceLine,
  plain
}: {
  language?: string
  code: string
  body: React.ReactNode
  sourceLine?: number
  plain: boolean
}): React.JSX.Element {
  const rowKey = useContext(NativeChatMarkdownRowKeyContext)
  // Off until the reader asks; kept in the transcript's store so the row unmounting under
  // windowing, or a growing reply re-cutting its blocks, does not undo it. Never saved.
  const { open: wrapped, setOpen: setWrapped } = useNativeChatDisclosure(
    rowKey === undefined || sourceLine === undefined
      ? undefined
      : `code-wrap:${rowKey}:${sourceLine}`,
    false
  )
  const actions = code ? (
    <>
      <NativeChatCodeWrapButton wrapped={wrapped} onToggle={() => setWrapped(!wrapped)} />
      <NativeChatCopyButton
        text={code}
        label={translate('components.native-chat.copyCode', 'Copy code')}
      />
    </>
  ) : null
  // A mermaid fence still streaming shows its text: its <code> child would render the diagram.
  const plainBody = language?.toLowerCase() === 'mermaid' ? <code>{code}</code> : body

  return (
    <div
      data-native-chat-code-block={code ? '' : undefined}
      className="group/code relative my-3 min-w-0 max-w-full overflow-hidden rounded-lg border border-chat-code-border bg-chat-code-surface"
    >
      {language ? (
        <div className="flex h-7.5 items-center justify-between px-3">
          <span
            data-code-language={language}
            className="min-w-0 font-sans text-xs text-chat-foreground-faint"
          >
            <span className="truncate">{getCodeFenceLanguageLabel(language)}</span>
          </span>
          {code ? <div className="-mr-1 flex items-center gap-0.5">{actions}</div> : null}
        </div>
      ) : null}
      <pre
        data-native-chat-code-content
        className={cn(
          'scrollbar-sleek m-0 max-w-full font-mono text-chat-code text-chat-code-foreground',
          wrapped ? 'whitespace-pre-wrap [overflow-wrap:anywhere]' : 'overflow-x-auto',
          language ? 'px-3.5 pt-0.5 pb-3' : 'p-3 pr-16'
        )}
      >
        {language && code && !plain ? (
          <code>
            <NativeChatHighlightedCode code={code} language={language} />
          </code>
        ) : (
          plainBody
        )}
      </pre>
      {code && !language ? (
        <div className="absolute right-2 top-2 flex items-center gap-0.5 opacity-100 transition-opacity can-hover:pointer-events-none can-hover:opacity-0 group-hover/code:pointer-events-auto group-hover/code:opacity-100 [[class~='group/code']:has(:focus-visible)_&]:pointer-events-auto [[class~='group/code']:has(:focus-visible)_&]:opacity-100">
          {actions}
        </div>
      ) : null}
    </div>
  )
}

/** Looks like the Copy button beside it; pressed keeps the hover fill. */
function NativeChatCodeWrapButton({
  wrapped,
  onToggle
}: {
  wrapped: boolean
  onToggle: () => void
}): React.JSX.Element {
  const label = wrapped
    ? translate('components.native-chat.disableLineWrap', 'Disable line wrap')
    : translate('components.native-chat.wrapLines', 'Wrap lines')
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={label}
      aria-pressed={wrapped}
      title={label}
      className="flex size-6 shrink-0 items-center justify-center rounded-md text-chat-foreground-faint transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-pressed:bg-accent aria-pressed:text-accent-foreground"
    >
      <WrapText className="size-3.5" />
    </button>
  )
}

/** For dimmed rows: their code keeps the row's faint color, so it is not tokenized at all. */
export function NativeChatPlainCodeBlock(props: {
  children?: React.ReactNode
  language?: string
  sourceLine?: number
}): React.JSX.Element {
  return <NativeChatCodeBlock {...props} plain />
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
