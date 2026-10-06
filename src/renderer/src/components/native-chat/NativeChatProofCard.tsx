import { useContext, useMemo, useState } from 'react'
import {
  ArrowUpRight,
  Circle,
  CircleCheck,
  CircleDashed,
  CircleX,
  Code2,
  Globe,
  Monitor,
  PenTool,
  Smartphone,
  type LucideIcon
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import type {
  NativeChatProofCheck,
  NativeChatProofKind,
  NativeChatProofLink
} from '../../../../shared/native-chat-proof-card-payload'
import { parseNativeChatProofCard } from '../../../../shared/native-chat-proof-card-reader'
import { NATIVE_CHAT_WORKTREE_LINK_SCHEME } from '../../../../shared/native-chat-project-target'
import { NativeChatFencePreviewContext } from './native-chat-fence-preview'
import { nativeChatProjectCardKey } from './native-chat-project-card-choice'
import { NativeChatProjectReplyContext } from './native-chat-project-reply-context'
import { NativeChatProjectCardActions } from './NativeChatProjectCardActions'
import { NativeChatProjectChip } from './NativeChatProjectChip'
import { NativeChatProofViewer } from './NativeChatProofMedia'
import { NativeChatProofExpandToggle, NativeChatProofMoreNote } from './NativeChatProofOverflow'

const KIND_ICONS: Record<NativeChatProofKind, LucideIcon> = {
  web: Globe,
  ios: Smartphone,
  android: Smartphone,
  desktop: Monitor,
  figma: PenTool,
  code: Code2
}

function kindLabel(kind: NativeChatProofKind): string {
  switch (kind) {
    case 'web':
      return translate('components.native-chat.proof.kindWeb', 'Web')
    case 'ios':
      return translate('components.native-chat.proof.kindIos', 'iOS')
    case 'android':
      return translate('components.native-chat.proof.kindAndroid', 'Android')
    case 'desktop':
      return translate('components.native-chat.proof.kindDesktop', 'Desktop')
    case 'figma':
      return translate('components.native-chat.proof.kindFigma', 'Figma')
    case 'code':
      return translate('components.native-chat.proof.kindCode', 'Code')
  }
}

function KindBadge({ kind }: { kind: NativeChatProofKind }): React.JSX.Element {
  const Icon = KIND_ICONS[kind]
  return (
    <span
      data-proof-kind={kind}
      className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] font-medium leading-4 text-muted-foreground"
    >
      <Icon className="size-3" aria-hidden />
      {kindLabel(kind)}
    </span>
  )
}

const CHECK_ICONS: Record<NativeChatProofCheck['tone'], LucideIcon> = {
  pass: CircleCheck,
  fail: CircleX,
  unchecked: CircleDashed,
  neutral: Circle
}

/** Passing results read as normal text; a failure is warned, anything unchecked greyed.
 *  A row the card cut to fit shows its full text on hover and on "Show more". */
function ProofCheckRow({ check }: { check: NativeChatProofCheck }): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const Icon = CHECK_ICONS[check.tone]
  const label = expanded ? (check.full?.label ?? check.label) : check.label
  const result = expanded ? (check.full?.result ?? check.result) : check.result
  return (
    <li
      data-proof-check={check.tone}
      className={cn(
        'flex min-w-0 items-start gap-2 text-xs leading-5',
        check.tone === 'unchecked' && 'text-muted-foreground'
      )}
    >
      <Icon
        aria-hidden
        className={cn(
          'mt-[3px] size-3.5 shrink-0',
          check.tone === 'pass' && 'text-status-success',
          check.tone === 'fail' && 'text-status-warning',
          check.tone === 'unchecked' && 'text-muted-foreground',
          check.tone === 'neutral' && 'size-2 mx-[3px] mt-[6px] text-muted-foreground'
        )}
      />
      <span className="min-w-0 break-words">
        <span
          className={cn(check.tone !== 'unchecked' && 'text-muted-foreground')}
          title={expanded ? undefined : check.full?.label}
        >
          {label}
        </span>
        <span aria-hidden> · </span>
        <span
          data-proof-check-result=""
          title={expanded ? undefined : check.full?.result}
          className={cn(
            check.tone === 'fail' && 'font-medium text-status-warning',
            check.tone === 'unchecked' && 'italic'
          )}
        >
          {result}
        </span>
        {check.full ? (
          <NativeChatProofExpandToggle
            expanded={expanded}
            onToggle={() => setExpanded((open) => !open)}
          />
        ) : null}
      </span>
    </li>
  )
}

/** Keys from each label, counted so two checks with one label still key uniquely. */
function checkKeys(checks: readonly NativeChatProofCheck[]) {
  const seen = new Map<string, number>()
  return checks.map((check) => {
    const count = seen.get(check.label) ?? 0
    seen.set(check.label, count + 1)
    return { key: `${check.label}#${count}`, check }
  })
}

function ProofChecks({
  checks,
  hidden
}: {
  checks: readonly NativeChatProofCheck[]
  hidden: number
}) {
  if (checks.length === 0 && hidden === 0) {
    return null
  }
  return (
    <div className="flex min-w-0 flex-col gap-1">
      {checks.length > 0 ? (
        <ul
          aria-label={translate('components.native-chat.proof.checks', 'Checks')}
          className="m-0 flex list-none flex-col gap-1 p-0"
        >
          {checkKeys(checks).map(({ key, check }) => (
            <ProofCheckRow key={key} check={check} />
          ))}
        </ul>
      ) : null}
      <NativeChatProofMoreNote section="checks" count={hidden} />
    </div>
  )
}

function ProofLinks({ links, hidden }: { links: readonly NativeChatProofLink[]; hidden: number }) {
  if (links.length === 0 && hidden === 0) {
    return null
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {links.map((link, index) => (
        <Button
          key={`${index}:${link.url}`}
          type="button"
          variant="outline"
          size="xs"
          data-proof-link={link.url}
          title={link.full?.label ? `${link.full.label}\n${link.url}` : link.url}
          onClick={() => void window.api.shell.openUrl(link.url)}
        >
          <ArrowUpRight />
          {link.label}
        </Button>
      ))}
      <NativeChatProofMoreNote section="links" count={hidden} />
    </div>
  )
}

/** The summary, with "Show more" when the card cut it to fit. */
function ProofSummary({ summary, full }: { summary: string; full?: string }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <p data-proof-summary="" className="m-0 text-sm leading-relaxed text-foreground/90">
      {expanded && full ? full : summary}
      {full ? (
        <NativeChatProofExpandToggle
          expanded={expanded}
          onToggle={() => setExpanded((open) => !open)}
        />
      ) : null}
    </p>
  )
}

/**
 * A ```proof-card fence: what an agent's finished task looks like — a recording,
 * screenshots or a before/after slider — with what was and was not checked, links
 * out, and reply actions. Media is read only from ~/.orca-personal/proof/ on this
 * Mac; a file that cannot be shown gets a placeholder. Text the card cut to fit
 * keeps its full version a hover or "Show more" away, and a section with items left
 * out says how many. Bad JSON, the wrong shape or an unsafe media path shows
 * `fallback`, the raw block.
 */
export function NativeChatProofCard({
  source,
  fallback
}: {
  source: string
  fallback: React.ReactNode
}): React.JSX.Element {
  const card = useMemo(() => parseNativeChatProofCard(source), [source])
  const { messageId } = useContext(NativeChatFencePreviewContext)
  const channel = useContext(NativeChatProjectReplyContext)
  if (!card) {
    return <>{fallback}</>
  }
  const cardKey = messageId === undefined ? null : nativeChatProjectCardKey(messageId, source)
  const hidden = card.adjustments.droppedCounts
  return (
    <figure
      data-native-chat-proof-card=""
      data-proof-kind={card.kind}
      className="my-3 min-w-0 max-w-full overflow-hidden rounded-xl border border-border/60 bg-card text-card-foreground"
    >
      <div className="flex flex-col gap-2.5 px-3.5 py-3">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-1.5 text-xs leading-5">
          <span className="min-w-0">
            <NativeChatProjectChip
              href={`${NATIVE_CHAT_WORKTREE_LINK_SCHEME}${encodeURIComponent(card.worktree)}`}
            >
              <span className="font-medium text-muted-foreground">{card.worktree}</span>
            </NativeChatProjectChip>
          </span>
          {card.kind ? <KindBadge kind={card.kind} /> : null}
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <p
            data-proof-title=""
            title={card.full?.title}
            className="m-0 text-sm font-semibold leading-5"
          >
            {card.title}
          </p>
          {card.summary ? <ProofSummary summary={card.summary} full={card.full?.summary} /> : null}
        </div>
        <NativeChatProofViewer media={card.media} />
        <NativeChatProofMoreNote section="media" count={hidden.media} />
        <ProofChecks checks={card.checks} hidden={hidden.checks} />
        <ProofLinks links={card.links} hidden={hidden.links} />
        <NativeChatProofMoreNote section="actions" count={hidden.actions} />
      </div>
      <NativeChatProjectCardActions
        actions={card.actions}
        cardKey={cardKey}
        messageId={messageId}
        channel={channel}
      />
    </figure>
  )
}
