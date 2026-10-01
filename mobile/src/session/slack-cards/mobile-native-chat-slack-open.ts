import { buildNativeChatSlackLinks } from '../../../../src/shared/native-chat-slack-links'
import type { NativeChatSlackTarget } from '../../../../src/shared/native-chat-slack-href'
import { tryOpenExternalLink } from '../../platform/external-link'

/** Opens a chip or card target in Slack: the primary link, then its fallback if that fails. */
export async function openMobileNativeChatSlackTarget(
  target: NativeChatSlackTarget
): Promise<boolean> {
  const links = buildNativeChatSlackLinks(target)
  if (await tryOpenExternalLink(links.primary)) {
    return true
  }
  return links.fallback === null ? false : tryOpenExternalLink(links.fallback)
}
