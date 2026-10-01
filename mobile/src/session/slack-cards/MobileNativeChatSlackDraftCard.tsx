import { useContext, useMemo, type ReactNode } from 'react'
import { Text, View } from 'react-native'
import { nativeChatProjectCardKey } from '../../../../src/shared/native-chat-project-card-choice'
import { parseNativeChatSlackDraftCard } from '../../../../src/shared/native-chat-slack-card-payload'
import {
  MobileNativeChatMessageIdContext,
  MobileNativeChatProjectsContext
} from '../project-cards/mobile-native-chat-project-context'
import { MobileNativeChatCardActions } from '../project-cards/MobileNativeChatCardActions'
import {
  MobileNativeChatSlackConversationChip,
  MobileNativeChatSlackPersonName,
  MobileNativeChatSlackPill,
  slackCardStyles as styles
} from './MobileNativeChatSlackCardParts'
import { MobileNativeChatSlackMrkdwn } from './MobileNativeChatSlackMrkdwn'

/**
 * A ```slack-draft fence: a reply the assistant drafted, shown as not sent. The UI
 * never sends to Slack; its buttons only send their text into this chat, and the
 * assistant does the rest. Anything invalid shows `fallback`.
 */
export function MobileNativeChatSlackDraftCard({
  source,
  fallback
}: {
  source: string
  fallback: ReactNode
}): React.JSX.Element {
  const chat = useContext(MobileNativeChatProjectsContext)
  const messageId = useContext(MobileNativeChatMessageIdContext)
  const card = useMemo(() => parseNativeChatSlackDraftCard(source), [source])
  if (!card || !chat) {
    return <>{fallback}</>
  }
  const cardKey = messageId === undefined ? null : nativeChatProjectCardKey(messageId, source)
  const workspace =
    card.domain === undefined
      ? { teamId: card.teamId }
      : { teamId: card.teamId, domain: card.domain }
  return (
    <View
      style={styles.card}
      accessibilityLabel={`Slack draft to ${card.to?.name ?? card.channel?.name ?? 'Slack'}, not sent`}
    >
      <View style={styles.body}>
        <View style={styles.header}>
          <MobileNativeChatSlackPill tone="draft" />
          <Text style={styles.line}>
            {card.to ? (
              <>
                <Text style={styles.muted}>To </Text>
                <MobileNativeChatSlackPersonName card={card} person={card.to} />
              </>
            ) : null}
            {card.channel ? (
              <>
                <Text style={styles.muted}>{card.to ? ' in ' : 'In '}</Text>
                <MobileNativeChatSlackConversationChip card={card} conversation={card.channel} />
              </>
            ) : null}
            {card.threadTs ? <Text style={styles.muted}> · in thread</Text> : null}
          </Text>
        </View>
        <View style={styles.quote}>
          <MobileNativeChatSlackMrkdwn source={card.text} workspace={workspace} />
        </View>
      </View>
      <MobileNativeChatCardActions
        actions={card.actions}
        cardKey={cardKey}
        messageId={messageId}
        chat={chat}
      />
    </View>
  )
}
