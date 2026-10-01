import { NATIVE_CHAT_PROJECT_CARD_FENCE } from '../../../../src/shared/native-chat-project-card-payload'
import { parseNativeChatWorktreeHref } from '../../../../src/shared/native-chat-project-target'
import {
  NATIVE_CHAT_SLACK_DRAFT_FENCE,
  NATIVE_CHAT_SLACK_MESSAGE_FENCE
} from '../../../../src/shared/native-chat-slack-card-payload'
import { isNativeChatSlackHref } from '../../../../src/shared/native-chat-slack-href'
import type { MobileMarkdownRenderers } from '../../components/mobile-markdown-renderers'
import { MobileNativeChatSlackChip } from '../slack-cards/MobileNativeChatSlackChip'
import { MobileNativeChatSlackDraftCard } from '../slack-cards/MobileNativeChatSlackDraftCard'
import { MobileNativeChatSlackMessageCard } from '../slack-cards/MobileNativeChatSlackMessageCard'
import { MobileNativeChatProjectCard } from './MobileNativeChatProjectCard'
import { MobileNativeChatProjectChip } from './MobileNativeChatProjectChip'

/** Native chat's card fences (```project-card, ```slack-message, ```slack-draft) and
 *  its `orca-worktree:` and Slack chip links. */
export const MOBILE_NATIVE_CHAT_MARKDOWN_RENDERERS: MobileMarkdownRenderers = {
  renderFence: (fence, codeBlock, key) => {
    switch (fence.language?.toLowerCase()) {
      case NATIVE_CHAT_PROJECT_CARD_FENCE:
        return <MobileNativeChatProjectCard key={key} source={fence.text} fallback={codeBlock} />
      case NATIVE_CHAT_SLACK_MESSAGE_FENCE:
        return (
          <MobileNativeChatSlackMessageCard key={key} source={fence.text} fallback={codeBlock} />
        )
      case NATIVE_CHAT_SLACK_DRAFT_FENCE:
        return <MobileNativeChatSlackDraftCard key={key} source={fence.text} fallback={codeBlock} />
      default:
        return null
    }
  },
  renderLink: (href, label, key) => {
    if (isNativeChatSlackHref(href)) {
      return <MobileNativeChatSlackChip key={key} href={href} label={label} />
    }
    return parseNativeChatWorktreeHref(href) === null ? null : (
      <MobileNativeChatProjectChip key={key} href={href} label={label} />
    )
  }
}
