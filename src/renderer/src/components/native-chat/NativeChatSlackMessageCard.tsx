import { useContext, useMemo } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getIntlLocale, translate } from '@/i18n/i18n'
import { formatUiRelativeTimeFromDate } from '@/i18n/relative-time-format'
import {
  nativeChatSlackMessageCardTarget,
  parseNativeChatSlackMessageCard,
  type NativeChatSlackMessageCard as SlackMessageCard
} from '../../../../shared/native-chat-slack-card-payload'
import { NativeChatFencePreviewContext } from './native-chat-fence-preview'
import { nativeChatProjectCardKey } from './native-chat-project-card-choice'
import { NativeChatProjectReplyContext } from './native-chat-project-reply-context'
import { NativeChatCardStatusPill } from './NativeChatCardStatusPill'
import { NativeChatProjectCardActions } from './NativeChatProjectCardActions'
import { openNativeChatSlackTarget } from './NativeChatSlackChip'
import {
  NativeChatSlackConversationChip,
  NativeChatSlackPersonChip
} from './NativeChatSlackCardChips'
import { NativeChatSlackImages } from './NativeChatSlackImages'
import { NativeChatSlackText } from './NativeChatSlackText'

function SentAt({ sentAt }: { sentAt: string }): React.JSX.Element {
  const date = new Date(sentAt)
  const full = new Intl.DateTimeFormat(getIntlLocale(), {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date)
  return (
    <time dateTime={sentAt} title={full} className="shrink-0 tabular-nums">
      {formatUiRelativeTimeFromDate(sentAt)}
    </time>
  )
}

function ThreadLine({
  thread
}: {
  thread: NonNullable<SlackMessageCard['thread']>
}): React.JSX.Element {
  const replies =
    thread.replies === 1
      ? translate('components.native-chat.slack.oneReply', '1 reply')
      : translate('components.native-chat.slack.replies', '{{value0}} replies', {
          value0: thread.replies
        })
  return (
    <p data-slack-thread="" className="m-0 text-xs leading-4 text-muted-foreground">
      <span aria-hidden>🧵 </span>
      {replies} ·{' '}
      {thread.youReplied ? (
        translate('components.native-chat.slack.youReplied', 'you replied')
      ) : (
        <span className="font-medium text-foreground">
          {translate('components.native-chat.slack.notReplied', 'you haven’t replied')}
        </span>
      )}
    </p>
  )
}

/**
 * A ```slack-message fence: a Slack message that may need the user, with who sent
 * it where, the assistant's summary, the original text, its images and thread,
 * reply actions and a way into Slack. Anything off the schema shows `fallback`.
 */
export function NativeChatSlackMessageCard({
  source,
  fallback
}: {
  source: string
  fallback: React.ReactNode
}): React.JSX.Element {
  const card = useMemo(() => parseNativeChatSlackMessageCard(source), [source])
  const { messageId } = useContext(NativeChatFencePreviewContext)
  const channel = useContext(NativeChatProjectReplyContext)
  const target = useMemo(() => (card ? nativeChatSlackMessageCardTarget(card) : null), [card])
  const textOptions = useMemo(
    () =>
      card
        ? {
            teamId: card.teamId,
            domain: target?.domain,
            userNames: card.from.userId ? { [card.from.userId]: card.from.name } : undefined
          }
        : {},
    [card, target]
  )
  if (!card || !target) {
    return <>{fallback}</>
  }
  const cardKey = messageId === undefined ? null : nativeChatProjectCardKey(messageId, source)
  return (
    <figure
      data-native-chat-slack-card="message"
      data-slack-status={card.status}
      className="my-3 min-w-0 max-w-full overflow-hidden rounded-xl border border-border/60 bg-card text-card-foreground"
    >
      <div className="flex flex-col gap-2 px-3.5 py-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-1.5 text-xs leading-5 text-muted-foreground">
          <span className="mr-1">
            {card.status === 'needs-you' ? (
              <NativeChatCardStatusPill status="needs-you" />
            ) : (
              <NativeChatCardStatusPill
                status="idle"
                label={translate('components.native-chat.slack.fyi', 'FYI')}
              />
            )}
          </span>
          <NativeChatSlackPersonChip card={card} person={card.from} />
          <span aria-hidden>→</span>
          <NativeChatSlackConversationChip card={card} conversation={card.channel} />
          {card.sentAt ? (
            <>
              <span aria-hidden>·</span>
              <SentAt sentAt={card.sentAt} />
            </>
          ) : null}
        </div>
        <p data-slack-summary="" className="m-0 text-sm font-semibold leading-5">
          {card.summary}
        </p>
        {card.text ? (
          <div className="border-l-2 border-border pl-2.5">
            <NativeChatSlackText text={card.text} options={textOptions} clamp />
          </div>
        ) : null}
        <NativeChatSlackImages images={card.images} />
        {card.thread ? <ThreadLine thread={card.thread} /> : null}
      </div>
      <NativeChatProjectCardActions
        actions={card.actions}
        cardKey={cardKey}
        messageId={messageId}
        channel={channel}
      />
      <div className="flex items-center justify-end border-t border-border/60 px-3.5 py-2">
        <Button
          type="button"
          variant="outline"
          size="xs"
          data-slack-open=""
          onClick={() => openNativeChatSlackTarget(target)}
        >
          <ArrowUpRight />
          {translate('components.native-chat.slack.openInSlack', 'Open in Slack')}
        </Button>
      </div>
    </figure>
  )
}
