import { translate } from '@/i18n/i18n'
import {
  nativeChatSlackConversationTarget,
  nativeChatSlackPersonTarget,
  type NativeChatSlackConversation,
  type NativeChatSlackPerson
} from '../../../../shared/native-chat-slack-card-payload'
import { NativeChatSlackTargetChip } from './NativeChatSlackChip'

type CardScope = { teamId: string; domain?: string; permalink?: string }

/** A card's person as a chip; with no user id (a bot, say) just their name. */
export function NativeChatSlackPersonChip({
  card,
  person
}: {
  card: CardScope
  person: NativeChatSlackPerson
}): React.JSX.Element {
  const target = nativeChatSlackPersonTarget(card, person)
  return target ? (
    <NativeChatSlackTargetChip target={target}>{person.name}</NativeChatSlackTargetChip>
  ) : (
    <span data-native-chat-slack-chip="name" className="min-w-0 truncate font-medium">
      {person.name}
    </span>
  )
}

function conversationLabel(conversation: NativeChatSlackConversation): string {
  if (conversation.kind === 'channel') {
    return `#${conversation.name ?? conversation.id}`
  }
  if (conversation.name) {
    return conversation.name
  }
  return conversation.kind === 'dm'
    ? translate('components.native-chat.slack.directMessage', 'Direct message')
    : translate('components.native-chat.slack.group', 'Group')
}

export function NativeChatSlackConversationChip({
  card,
  conversation
}: {
  card: CardScope
  conversation: NativeChatSlackConversation
}): React.JSX.Element {
  return (
    <NativeChatSlackTargetChip target={nativeChatSlackConversationTarget(card, conversation)}>
      {conversationLabel(conversation)}
    </NativeChatSlackTargetChip>
  )
}
