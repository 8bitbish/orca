import type React from 'react'
import { AgentStateDot } from '@/components/AgentStateDot'
import { translate } from '@/i18n/i18n'
import { NativeChatChipButton } from './NativeChatChipButton'
import { NativeChatProjectIcon } from './NativeChatProjectIcon'
import { NativeChatSlackChip } from './NativeChatSlackChip'
import {
  nativeChatProjectStatusDot,
  nativeChatProjectStatusLabel
} from './native-chat-project-status'
import { parseNativeChatWorktreeHref } from './native-chat-project-target'
import { isNativeChatSlackHref } from '../../../../shared/native-chat-slack-href'
import { focusNativeChatProject, useNativeChatProject } from './use-native-chat-project'
import { useNativeChatProjectLiveStatus } from './use-native-chat-project-live-status'

/**
 * An `[name](orca-worktree:repo/workspace)` link in a reply: a pill with the
 * project's icon, name, workspace and live status dot that focuses the
 * workspace. A target Orca does not know reads as the link's plain text.
 */
export function NativeChatProjectChip({
  href,
  children
}: {
  href: string
  children?: React.ReactNode
}): React.JSX.Element {
  const project = useNativeChatProject(parseNativeChatWorktreeHref(href) ?? '')
  const { status } = useNativeChatProjectLiveStatus(project?.target ?? null)
  if (!project) {
    return <span data-native-chat-project-chip="unknown">{children}</span>
  }
  const statusLabel = nativeChatProjectStatusLabel(status)
  const title = project.workspace ? `${project.name} · ${project.workspace}` : project.name
  return (
    <NativeChatChipButton
      lead="icon"
      data-native-chat-project-chip="resolved"
      data-project-status={status}
      onActivate={() => focusNativeChatProject(project.target)}
      aria-label={translate(
        'components.native-chat.project.chipLabel',
        'Open {{value0}}, {{value1}}',
        {
          value0: title,
          value1: statusLabel
        }
      )}
    >
      <NativeChatProjectIcon source={project.icon} size="sm" />
      <span className="min-w-0 truncate font-medium">{project.name}</span>
      {project.workspace ? (
        <span className="min-w-0 truncate text-muted-foreground">{project.workspace}</span>
      ) : null}
      <AgentStateDot state={nativeChatProjectStatusDot(status)} title={null} />
    </NativeChatChipButton>
  )
}

/** Stable renderer for CommentMarkdown's `renderChatLink`. */
export function renderNativeChatLink({
  href,
  children
}: {
  href: string
  children?: React.ReactNode
}): React.JSX.Element {
  return isNativeChatSlackHref(href) ? (
    <NativeChatSlackChip href={href}>{children}</NativeChatSlackChip>
  ) : (
    <NativeChatProjectChip href={href}>{children}</NativeChatProjectChip>
  )
}
