import { useContext, useMemo } from 'react'
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
import {
  parseNativeChatProofCard,
  type NativeChatProofCheck,
  type NativeChatProofKind
} from '../../../../shared/native-chat-proof-card-payload'
import { NATIVE_CHAT_WORKTREE_LINK_SCHEME } from '../../../../shared/native-chat-project-target'
import { NativeChatFencePreviewContext } from './native-chat-fence-preview'
import { nativeChatProjectCardKey } from './native-chat-project-card-choice'
import { NativeChatProjectReplyContext } from './native-chat-project-reply-context'
import { NativeChatProjectCardActions } from './NativeChatProjectCardActions'
import { NativeChatProjectChip } from './NativeChatProjectChip'
import { NativeChatProofViewer } from './NativeChatProofMedia'

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

/** Passing results read as normal text; a failure is warned, anything unchecked greyed. */
function ProofChecks({ checks }: { checks: readonly NativeChatProofCheck[] }) {
  if (checks.length === 0) {
    return null
  }
  return (
    <ul
      aria-label={translate('components.native-chat.proof.checks', 'Checks')}
      className="m-0 flex list-none flex-col gap-1 p-0"
    >
      {checks.map((check, index) => {
        const Icon = CHECK_ICONS[check.tone]
        return (
          <li
            key={`${index}:${check.label}`}
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
              <span className={cn(check.tone !== 'unchecked' && 'text-muted-foreground')}>
                {check.label}
              </span>
              <span aria-hidden> · </span>
              <span
                className={cn(
                  check.tone === 'fail' && 'font-medium text-status-warning',
                  check.tone === 'unchecked' && 'italic'
                )}
              >
                {check.result}
              </span>
            </span>
          </li>
        )
      })}
    </ul>
  )
}

function ProofLinks({ links }: { links: readonly { label: string; url: string }[] }) {
  if (links.length === 0) {
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
          title={link.url}
          onClick={() => void window.api.shell.openUrl(link.url)}
        >
          <ArrowUpRight />
          {link.label}
        </Button>
      ))}
    </div>
  )
}

/**
 * A ```proof-card fence: what an agent's finished task looks like — a recording,
 * screenshots or a before/after slider — with what was and was not checked, links
 * out, and reply actions. Media is read only from ~/.orca-personal/proof/ on this
 * Mac; a file that cannot be shown gets a placeholder. Anything off the schema
 * shows `fallback`, the raw block.
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
          <p data-proof-title="" className="m-0 text-sm font-semibold leading-5">
            {card.title}
          </p>
          {card.summary ? (
            <p data-proof-summary="" className="m-0 text-sm leading-relaxed text-foreground/90">
              {card.summary}
            </p>
          ) : null}
        </div>
        <NativeChatProofViewer media={card.media} />
        <ProofChecks checks={card.checks} />
        <ProofLinks links={card.links} />
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
