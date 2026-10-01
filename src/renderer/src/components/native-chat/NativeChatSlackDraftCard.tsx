import { useContext, useMemo } from 'react'
import { PenLine } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import {
  parseNativeChatSlackDraftCard,
  type NativeChatSlackDraftCard as SlackDraftCard
} from '../../../../shared/native-chat-slack-card-payload'
import { NativeChatFencePreviewContext } from './native-chat-fence-preview'
import { nativeChatProjectCardKey } from './native-chat-project-card-choice'
import { NativeChatProjectReplyContext } from './native-chat-project-reply-context'
import { NativeChatProjectCardActions } from './NativeChatProjectCardActions'
import {
  NativeChatSlackConversationChip,
  NativeChatSlackPersonChip
} from './NativeChatSlackCardChips'
import { NativeChatSlackText } from './NativeChatSlackText'

function Recipients({ card }: { card: SlackDraftCard }): React.JSX.Element {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-1.5 text-xs leading-5 text-muted-foreground">
      {card.to ? (
        <>
          <span>{translate('components.native-chat.slack.to', 'To')}</span>
          <NativeChatSlackPersonChip card={card} person={card.to} />
        </>
      ) : null}
      {card.channel ? (
        <>
          <span>{translate('components.native-chat.slack.in', 'in')}</span>
          <NativeChatSlackConversationChip card={card} conversation={card.channel} />
        </>
      ) : null}
      {card.threadTs ? (
        <span>· {translate('components.native-chat.slack.inThread', 'in thread')}</span>
      ) : null}
    </div>
  )
}

/**
 * A ```slack-draft fence: a reply the assistant drafted, clearly not sent. Nothing
 * here talks to Slack; its buttons only answer in this chat, and the assistant
 * sends through slack-mcp's checked tool. Anything off the schema shows `fallback`.
 */
export function NativeChatSlackDraftCard({
  source,
  fallback
}: {
  source: string
  fallback: React.ReactNode
}): React.JSX.Element {
  const card = useMemo(() => parseNativeChatSlackDraftCard(source), [source])
  const { messageId } = useContext(NativeChatFencePreviewContext)
  const channel = useContext(NativeChatProjectReplyContext)
  const textOptions = useMemo(
    () =>
      card
        ? {
            teamId: card.teamId,
            domain: card.domain,
            userNames: card.to?.userId ? { [card.to.userId]: card.to.name } : undefined
          }
        : {},
    [card]
  )
  if (!card) {
    return <>{fallback}</>
  }
  const cardKey = messageId === undefined ? null : nativeChatProjectCardKey(messageId, source)
  return (
    <figure
      data-native-chat-slack-card="draft"
      className="my-3 min-w-0 max-w-full overflow-hidden rounded-xl border border-dashed border-border bg-card text-card-foreground"
    >
      <div className="flex flex-col gap-2 px-3.5 py-3">
        <span
          data-slack-draft-label=""
          className="inline-flex shrink-0 items-center self-start gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] font-medium leading-4 text-muted-foreground"
        >
          <PenLine aria-hidden className="size-3" />
          {translate('components.native-chat.slack.draftNotSent', 'Draft, not sent')}
        </span>
        <Recipients card={card} />
        <div className="rounded-md bg-muted/40 px-2.5 py-2">
          <NativeChatSlackText text={card.text} options={textOptions} />
        </div>
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
