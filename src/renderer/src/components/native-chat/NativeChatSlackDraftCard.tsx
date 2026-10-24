import { useContext, useMemo } from 'react'
import { MessageCircle, MessageSquare, PenLine } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import type { SlackMrkdwnMarkdownOptions } from '../../../../shared/native-chat-slack-mrkdwn'
import {
  nativeChatSlackReplyToTarget,
  parseNativeChatSlackDraftCard,
  type NativeChatDraftCard,
  type NativeChatDraftChatPlatform,
  type NativeChatSlackDraftCard as SlackDraftCard
} from '../../../../shared/native-chat-slack-draft-card-payload'
import {
  EMPTY_NATIVE_CHAT_SLACK_NAMES,
  nativeChatSlackCardKnownNames
} from '../../../../shared/native-chat-slack-names-contract'
import { NativeChatFencePreviewContext } from './native-chat-fence-preview'
import { nativeChatProjectCardKey } from './native-chat-project-card-choice'
import { NativeChatProjectReplyContext } from './native-chat-project-reply-context'
import { NativeChatProjectCardActions } from './NativeChatProjectCardActions'
import {
  NativeChatSlackConversationChip,
  NativeChatSlackPersonChip
} from './NativeChatSlackCardChips'
import { NativeChatSlackTargetChip } from './NativeChatSlackChip'
import { NativeChatSlackText } from './NativeChatSlackText'
import { useNativeChatSlackNames } from './use-native-chat-slack-names'

const CHAT_PLATFORMS: Record<
  NativeChatDraftChatPlatform,
  { label: () => string; Icon: typeof MessageCircle }
> = {
  whatsapp: {
    label: () => translate('components.native-chat.slack.whatsapp', 'WhatsApp'),
    Icon: MessageCircle
  },
  messenger: {
    label: () => translate('components.native-chat.slack.messenger', 'Messenger'),
    Icon: MessageSquare
  }
}

function Recipients({ card }: { card: NativeChatDraftCard }): React.JSX.Element {
  if (card.platform !== 'slack') {
    return (
      <div className="flex min-w-0 items-center gap-x-1 text-xs leading-5 text-muted-foreground">
        <span>{translate('components.native-chat.slack.to', 'To')}</span>
        <span data-chat-draft-chat="" className="min-w-0 truncate font-medium text-foreground">
          {card.chat.name}
        </span>
      </div>
    )
  }
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

function ReplyToSender({ card }: { card: NativeChatDraftCard }): React.JSX.Element | null {
  const quoted = card.replyTo
  if (!quoted) {
    return null
  }
  if (card.platform !== 'slack') {
    return <span className="min-w-0 truncate font-medium text-foreground">{quoted.from.name}</span>
  }
  const target = nativeChatSlackReplyToTarget(card)
  return (
    <>
      <NativeChatSlackPersonChip card={card} person={quoted.from} />
      {target ? (
        <NativeChatSlackTargetChip target={target}>
          {translate('components.native-chat.slack.originalMessage', 'Original')}
        </NativeChatSlackTargetChip>
      ) : null}
    </>
  )
}

/** The message the draft answers, quoted and muted above the draft. */
function ReplyTo({
  card,
  options
}: {
  card: NativeChatDraftCard
  options: SlackMrkdwnMarkdownOptions
}): React.JSX.Element | null {
  if (!card.replyTo) {
    return null
  }
  return (
    <blockquote
      data-slack-draft-reply-to=""
      className="flex min-w-0 flex-col gap-1 border-l-2 border-border pl-2.5 text-muted-foreground"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-1.5 text-xs leading-5">
        <span>{translate('components.native-chat.slack.replyingTo', 'Replying to')}</span>
        <ReplyToSender card={card} />
      </div>
      <NativeChatSlackText text={card.replyTo.text} options={options} clamp />
    </blockquote>
  )
}

function PlatformLabel({ card }: { card: NativeChatDraftCard }): React.JSX.Element | null {
  if (card.platform === 'slack') {
    return null
  }
  const { label, Icon } = CHAT_PLATFORMS[card.platform]
  return (
    <span
      data-chat-draft-platform={card.platform}
      className="inline-flex shrink-0 items-center gap-1 text-2xs font-medium leading-4 text-muted-foreground"
    >
      <Icon aria-hidden className="size-3" />
      {label()}
    </span>
  )
}

function slackKnownNames(card: SlackDraftCard) {
  return nativeChatSlackCardKnownNames({
    people: [card.to, card.replyTo?.from],
    conversations: [card.channel]
  })
}

/**
 * A ```slack-draft fence: a reply the assistant drafted (Slack, WhatsApp or
 * Messenger), clearly not sent, optionally under the message it answers. Nothing
 * here talks to any of them; its buttons only answer in this chat, and the
 * assistant sends through its checked tools. Anything off the schema shows `fallback`.
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
  const slackCard = card?.platform === 'slack' ? card : null
  const known = useMemo(
    () => (slackCard ? slackKnownNames(slackCard) : EMPTY_NATIVE_CHAT_SLACK_NAMES),
    [slackCard]
  )
  const names = useNativeChatSlackNames(
    slackCard ? [slackCard.replyTo?.text, slackCard.text].filter(Boolean).join('\n') : '',
    known
  )
  // Without a team id, mentions in a WhatsApp/Messenger draft stay plain text.
  const textOptions = useMemo<SlackMrkdwnMarkdownOptions>(
    () =>
      slackCard
        ? {
            teamId: slackCard.teamId,
            domain: slackCard.domain,
            userNames: names.users,
            channelNames: names.channels
          }
        : {},
    [slackCard, names]
  )
  if (!card) {
    return <>{fallback}</>
  }
  const cardKey = messageId === undefined ? null : nativeChatProjectCardKey(messageId, source)
  return (
    <figure
      data-native-chat-slack-card="draft"
      data-chat-draft-platform={card.platform}
      className="my-3 min-w-0 max-w-full overflow-hidden rounded-xl border border-dashed border-border bg-card text-card-foreground"
    >
      <div className="flex flex-col gap-2 px-3.5 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span
            data-slack-draft-label=""
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-2xs font-medium leading-4 text-muted-foreground"
          >
            <PenLine aria-hidden className="size-3" />
            {translate('components.native-chat.slack.draftNotSent', 'Draft, not sent')}
          </span>
          <PlatformLabel card={card} />
        </div>
        <Recipients card={card} />
        <ReplyTo card={card} options={textOptions} />
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
