import type React from 'react'
import { AgentStateDot } from '@/components/AgentStateDot'
import { translate } from '@/i18n/i18n'
import { NativeChatProjectIcon } from './NativeChatProjectIcon'
import {
  nativeChatProjectStatusDot,
  nativeChatProjectStatusLabel
} from './native-chat-project-status'
import { parseNativeChatWorktreeHref } from './native-chat-project-target'
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
    <button
      type="button"
      data-native-chat-project-chip="resolved"
      data-project-status={status}
      onClick={(event) => {
        // A chip sits inside selectable reply prose; the click is the chip's alone.
        event.stopPropagation()
        focusNativeChatProject(project.target)
      }}
      aria-label={translate(
        'components.native-chat.project.chipLabel',
        'Open {{value0}}, {{value1}}',
        {
          value0: title,
          value1: statusLabel
        }
      )}
      className="mx-0.5 inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-muted/60 py-px pl-0.5 pr-1.5 align-[-0.2em] text-[12px] leading-5 text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
    >
      <NativeChatProjectIcon source={project.icon} size="sm" />
      <span className="min-w-0 truncate font-medium">{project.name}</span>
      {project.workspace ? (
        <span className="min-w-0 truncate text-muted-foreground">{project.workspace}</span>
      ) : null}
      <AgentStateDot state={nativeChatProjectStatusDot(status)} title={null} />
    </button>
  )
}

/** Stable renderer for CommentMarkdown's `renderWorktreeLink`. */
export function renderNativeChatWorktreeLink({
  href,
  children
}: {
  href: string
  children?: React.ReactNode
}): React.JSX.Element {
  return <NativeChatProjectChip href={href}>{children}</NativeChatProjectChip>
}
