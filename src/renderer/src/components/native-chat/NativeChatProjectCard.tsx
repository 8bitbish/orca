import { useContext, useMemo } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { AgentStateDot } from '@/components/AgentStateDot'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { NativeChatFencePreviewContext } from './native-chat-fence-preview'
import { parseNativeChatProjectCardPayload } from '../../../../shared/native-chat-project-card-payload'
import { nativeChatProjectCardKey } from './native-chat-project-card-choice'
import { NativeChatProjectReplyContext } from './native-chat-project-reply-context'
import {
  nativeChatProjectStatusDot,
  nativeChatProjectStatusLabel,
  type NativeChatProjectStatus
} from './native-chat-project-status'
import { NativeChatProjectCardActions } from './NativeChatProjectCardActions'
import { NativeChatProjectIcon } from './NativeChatProjectIcon'
import { focusNativeChatProject, useNativeChatProject } from './use-native-chat-project'
import { useNativeChatProjectLiveStatus } from './use-native-chat-project-live-status'

function StatusPill({ status }: { status: NativeChatProjectStatus }): React.JSX.Element {
  return (
    <span
      data-project-status={status}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] leading-4',
        // Only "Needs you" carries colour, so it is the one that reads first.
        status === 'needs-you' &&
          'border-agent-question/40 bg-agent-question/15 font-semibold text-agent-question-text',
        status === 'working' && 'border-border bg-muted font-medium text-foreground',
        status === 'done' && 'border-border font-medium text-foreground',
        status === 'idle' && 'border-border text-muted-foreground',
        status === 'unverifiable' && 'border-dashed border-border text-muted-foreground'
      )}
    >
      <AgentStateDot state={nativeChatProjectStatusDot(status)} title={null} />
      {nativeChatProjectStatusLabel(status)}
    </span>
  )
}

/**
 * A ```project-card fence: a project's live status in the reply, with the
 * assistant's note and ask as written and, when it has a decision to offer, reply
 * actions. Bad JSON or a workspace Orca does not know shows `fallback`, the raw
 * block, never a blank.
 */
export function NativeChatProjectCard({
  source,
  fallback
}: {
  source: string
  fallback: React.ReactNode
}): React.JSX.Element {
  const payload = useMemo(() => parseNativeChatProjectCardPayload(source), [source])
  const project = useNativeChatProject(payload?.worktree ?? '', payload?.icon)
  const live = useNativeChatProjectLiveStatus(project?.target ?? null)
  const { messageId } = useContext(NativeChatFencePreviewContext)
  const channel = useContext(NativeChatProjectReplyContext)
  if (!payload || !project) {
    return <>{fallback}</>
  }
  const cardKey = messageId === undefined ? null : nativeChatProjectCardKey(messageId, source)
  return (
    <figure
      data-native-chat-project-card=""
      data-project-status={live.status}
      className="my-3 min-w-0 max-w-full overflow-hidden rounded-xl border border-border/60 bg-card text-card-foreground"
    >
      <div className="flex flex-col gap-2 px-3.5 py-3">
        {/* The pill wraps under the name in a narrow column rather than squeezing it. */}
        <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1.5">
          <div className="flex min-w-[8rem] flex-1 items-center gap-2">
            <NativeChatProjectIcon source={project.icon} size="md" />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold leading-5">{project.name}</div>
              {project.workspace ? (
                <div className="truncate text-xs leading-4 text-muted-foreground">
                  {project.workspace}
                </div>
              ) : null}
            </div>
          </div>
          <StatusPill status={live.status} />
        </div>
        {payload.note ? <p className="m-0 text-sm leading-relaxed">{payload.note}</p> : null}
        {live.liveLine ? (
          <div
            data-project-live-line=""
            className="flex min-w-0 items-baseline gap-1.5 text-xs text-muted-foreground"
          >
            <span className="min-w-0 flex-1 truncate">{live.liveLine.text}</span>
            {live.liveLine.time ? (
              <span className="shrink-0 tabular-nums">· {live.liveLine.time}</span>
            ) : null}
          </div>
        ) : null}
        {payload.ask ? (
          <p className="m-0 rounded-md border-l-2 border-agent-question bg-agent-question/10 px-2.5 py-1.5 text-sm leading-relaxed">
            {payload.ask}
          </p>
        ) : null}
      </div>
      <NativeChatProjectCardActions
        actions={payload.actions}
        cardKey={cardKey}
        messageId={messageId}
        channel={channel}
      />
      <div className="flex items-center justify-end border-t border-border/60 px-3.5 py-2">
        <Button
          type="button"
          variant="outline"
          size="xs"
          aria-label={translate('components.native-chat.project.openLabel', 'Open {{value0}}', {
            value0: project.workspace ? `${project.name} ${project.workspace}` : project.name
          })}
          onClick={() => focusNativeChatProject(project.target)}
        >
          <ArrowUpRight />
          {translate('components.native-chat.project.open', 'Open')}
        </Button>
      </div>
    </figure>
  )
}
