import { AgentStateDot } from '@/components/AgentStateDot'
import { cn } from '@/lib/utils'
import {
  nativeChatProjectStatusDot,
  nativeChatProjectStatusLabel,
  type NativeChatProjectStatus
} from './native-chat-project-status'

/** A chat card's status pill; `label` overrides the status's own wording. */
export function NativeChatCardStatusPill({
  status,
  label
}: {
  status: NativeChatProjectStatus
  label?: string
}): React.JSX.Element {
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
      {label ?? nativeChatProjectStatusLabel(status)}
    </span>
  )
}
