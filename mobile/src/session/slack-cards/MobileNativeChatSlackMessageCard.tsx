import { useContext, useMemo, type ReactNode } from 'react'
import { Text, View } from 'react-native'
import { nativeChatProjectCardKey } from '../../../../src/shared/native-chat-project-card-choice'
import {
  nativeChatSlackMessageCardTarget,
  parseNativeChatSlackMessageCard,
  type NativeChatSlackMessageCard
} from '../../../../src/shared/native-chat-slack-card-payload'
import {
  MobileNativeChatMessageIdContext,
  MobileNativeChatProjectsContext
} from '../project-cards/mobile-native-chat-project-context'
import { MobileNativeChatCardActions } from '../project-cards/MobileNativeChatCardActions'
import {
  formatMobileNativeChatSlackSentAt,
  MobileNativeChatSlackConversationChip,
  mobileNativeChatSlackConversationLabel,
  MobileNativeChatSlackOpenButton,
  MobileNativeChatSlackPersonName,
  MobileNativeChatSlackPill,
  slackCardStyles as styles
} from './MobileNativeChatSlackCardParts'
import { MobileNativeChatSlackImages } from './MobileNativeChatSlackImages'
import { MobileNativeChatSlackMrkdwn } from './MobileNativeChatSlackMrkdwn'

export function mobileNativeChatSlackThreadLine(
  thread: NonNullable<NativeChatSlackMessageCard['thread']>
): string {
  const replies = `${thread.replies} ${thread.replies === 1 ? 'reply' : 'replies'}`
  return `🧵 ${replies} · ${thread.youReplied ? 'you replied' : 'you haven’t replied'}`
}

/**
 * A ```slack-message fence: a Slack message that needs Jake, with who sent it where,
 * the assistant's summary, the original text, images, the thread and reply buttons
 * that only ever send their text into this chat. Anything invalid shows `fallback`.
 */
export function MobileNativeChatSlackMessageCard({
  source,
  fallback
}: {
  source: string
  fallback: ReactNode
}): React.JSX.Element {
  const chat = useContext(MobileNativeChatProjectsContext)
  const messageId = useContext(MobileNativeChatMessageIdContext)
  const card = useMemo(() => parseNativeChatSlackMessageCard(source), [source])
  if (!card || !chat) {
    return <>{fallback}</>
  }
  const workspace = cardWorkspace(card)
  const cardKey = messageId === undefined ? null : nativeChatProjectCardKey(messageId, source)
  return (
    <View
      style={styles.card}
      accessibilityLabel={`Slack message from ${card.from.name} in ${mobileNativeChatSlackConversationLabel(card.channel)}`}
    >
      <View style={styles.body}>
        <View style={styles.header}>
          <MobileNativeChatSlackPill tone={card.status} />
          <Text style={styles.line}>
            <MobileNativeChatSlackPersonName card={card} person={card.from} />
            <Text style={styles.muted}> → </Text>
            <MobileNativeChatSlackConversationChip card={card} conversation={card.channel} />
            {card.sentAt ? (
              <Text style={styles.muted}> · {formatMobileNativeChatSlackSentAt(card.sentAt)}</Text>
            ) : null}
          </Text>
        </View>
        <Text style={styles.summary}>{card.summary}</Text>
        {card.text ? (
          <View style={styles.quote}>
            <MobileNativeChatSlackMrkdwn source={card.text} workspace={workspace} collapsible />
          </View>
        ) : null}
        <MobileNativeChatSlackImages images={card.images} />
        {card.thread ? (
          <Text style={styles.meta}>{mobileNativeChatSlackThreadLine(card.thread)}</Text>
        ) : null}
      </View>
      <MobileNativeChatCardActions
        actions={card.actions}
        cardKey={cardKey}
        messageId={messageId}
        chat={chat}
      />
      <MobileNativeChatSlackOpenButton target={nativeChatSlackMessageCardTarget(card)} />
    </View>
  )
}

/** Mentions in the text open in the card's workspace, domain read as the card reads it. */
function cardWorkspace(card: NativeChatSlackMessageCard): { teamId: string; domain?: string } {
  const { domain } = nativeChatSlackMessageCardTarget(card)
  return domain === undefined ? { teamId: card.teamId } : { teamId: card.teamId, domain }
}
