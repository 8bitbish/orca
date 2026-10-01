import { NATIVE_CHAT_PROJECT_CARD_FENCE } from '../../../../src/shared/native-chat-project-card-payload'
import { parseNativeChatWorktreeHref } from '../../../../src/shared/native-chat-project-target'
import type { MobileMarkdownRenderers } from '../../components/mobile-markdown-renderers'
import { MobileNativeChatProjectCard } from './MobileNativeChatProjectCard'
import { MobileNativeChatProjectChip } from './MobileNativeChatProjectChip'

/** Native chat's ```project-card fences and `orca-worktree:` links. */
export const MOBILE_NATIVE_CHAT_MARKDOWN_RENDERERS: MobileMarkdownRenderers = {
  renderFence: (fence, codeBlock, key) =>
    fence.language?.toLowerCase() === NATIVE_CHAT_PROJECT_CARD_FENCE ? (
      <MobileNativeChatProjectCard key={key} source={fence.text} fallback={codeBlock} />
    ) : null,
  renderLink: (href, label, key) =>
    parseNativeChatWorktreeHref(href) === null ? null : (
      <MobileNativeChatProjectChip key={key} href={href} label={label} />
    )
}
