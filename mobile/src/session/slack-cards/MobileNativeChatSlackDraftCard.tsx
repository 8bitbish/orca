import { useContext, useMemo, type ReactNode } from 'react'
import { Text, View } from 'react-native'
import { nativeChatProjectCardKey } from '../../../../src/shared/native-chat-project-card-choice'
import { parseNativeChatSlackDraftCard } from '../../../../src/shared/native-chat-slack-draft-card-payload'
import {
  EMPTY_NATIVE_CHAT_SLACK_NAMES,
  nativeChatSlackCardKnownNames
} from '../../../../src/shared/native-chat-slack-names-contract'
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
import { useMobileNativeChatSlackNames } from './use-mobile-native-chat-slack-names'
import { nativeChatDraftCardPress } from '../../../../src/shared/native-chat-card-press'

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
  const known = useMemo(
    () =>
      card?.platform === 'slack'
        ? nativeChatSlackCardKnownNames({ people: [card.to], conversations: [card.channel] })
        : EMPTY_NATIVE_CHAT_SLACK_NAMES,
    [card]
  )
  const names = useMobileNativeChatSlackNames(card?.platform === 'slack' ? card.text : '', known)
  // WhatsApp/Messenger drafts and reply quotes are desktop-only for now (Jake uses Companion).
  if (!card || card.platform !== 'slack' || !chat) {
    return <>{fallback}</>
  }
  const cardKey = messageId === undefined ? null : nativeChatProjectCardKey(messageId, source)
  const workspace =
    card.domain === undefined
      ? { teamId: card.teamId, names }
      : { teamId: card.teamId, domain: card.domain, names }
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
        press={nativeChatDraftCardPress(card)}
      />
    </View>
  )
}
