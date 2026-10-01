import type React from 'react'
import { useMemo } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import {
  buildNativeChatSlackHref,
  parseNativeChatSlackHref,
  type NativeChatSlackTarget
} from '../../../../shared/native-chat-slack-href'
import { NativeChatChipButton } from './NativeChatChipButton'

/** Opens a validated target in Slack; the host rebuilds every URL from the href. */
export function openNativeChatSlackTarget(target: NativeChatSlackTarget): void {
  void window.api.nativeChat.openSlack(buildNativeChatSlackHref(target)).catch(() => false)
}

const TRAILING_ARROW = /\s*↗\s*$/

/** The contract writes message links as `[Sam · sidebar ↗](…)`; the pill draws its own arrow. */
function withoutTrailingArrow(children: React.ReactNode): React.ReactNode {
  if (typeof children === 'string') {
    return children.replace(TRAILING_ARROW, '')
  }
  if (Array.isArray(children) && typeof children.at(-1) === 'string') {
    return [...children.slice(0, -1), String(children.at(-1)).replace(TRAILING_ARROW, '')]
  }
  return children
}

/** A person, channel or message pill that opens it in Slack. */
export function NativeChatSlackTargetChip({
  target,
  children
}: {
  target: NativeChatSlackTarget
  children?: React.ReactNode
}): React.JSX.Element {
  return (
    <NativeChatChipButton
      lead="text"
      data-native-chat-slack-chip={target.kind}
      onActivate={() => openNativeChatSlackTarget(target)}
    >
      <span className="min-w-0 truncate font-medium">
        {target.kind === 'message' ? withoutTrailingArrow(children) : children}
      </span>
      {target.kind === 'message' ? (
        <ArrowUpRight aria-hidden className="size-3 shrink-0 text-muted-foreground" />
      ) : null}
      <span className="sr-only">
        {translate('components.native-chat.slack.opensInSlack', '(opens in Slack)')}
      </span>
    </NativeChatChipButton>
  )
}

/**
 * A `slack-user:` / `slack-channel:` / `slack-message:` link in a reply. Anything
 * off the chip grammar reads as the link's plain text.
 */
export function NativeChatSlackChip({
  href,
  children
}: {
  href: string
  children?: React.ReactNode
}): React.JSX.Element {
  const target = useMemo(() => parseNativeChatSlackHref(href), [href])
  if (!target) {
    return <span data-native-chat-slack-chip="plain">{children}</span>
  }
  return <NativeChatSlackTargetChip target={target}>{children}</NativeChatSlackTargetChip>
}
