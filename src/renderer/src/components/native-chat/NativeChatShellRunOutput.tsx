import { useLayoutEffect, useRef } from 'react'
import {
  Check,
  CircleAlert,
  CircleHelp,
  Keyboard,
  Loader2,
  Square,
  SquareTerminal,
  X
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AnsiText } from '@/components/editor/AnsiText'
import { translate } from '@/i18n/i18n'
import type { NativeChatShellRunState } from '../../../../shared/native-chat-shell-run-state'
import {
  nativeChatShellRunInputText,
  nativeChatShellRunProblemText,
  nativeChatShellRunResultText
} from './native-chat-shell-run-copy'

/** Pixels from the bottom that still count as "at the bottom" for auto-scroll. */
const STICK_SLOP_PX = 8

function RunStatus({
  run,
  hostLost
}: {
  run: NativeChatShellRunState
  hostLost: boolean
}): React.JSX.Element {
  const active = run.phase === 'starting' || run.phase === 'running' || run.phase === 'stopping'
  if (active && hostLost) {
    return (
      <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
        <CircleHelp className="size-3.5 shrink-0" />
        <span className="truncate">
          {translate('components.native-chat.shellRun.status.unverifiable', 'Unverifiable')} ·{' '}
          {nativeChatShellRunProblemText('host-unreachable')}
        </span>
      </span>
    )
  }
  if (run.phase === 'running' && run.needsInput !== null) {
    return (
      <span className="flex min-w-0 items-center gap-1.5 font-medium text-agent-question-text">
        <Keyboard className="size-3.5 shrink-0" />
        <span className="truncate">
          {translate('components.native-chat.shellRun.status.needsInput', 'Needs input')} ·{' '}
          {nativeChatShellRunInputText(run.needsInput)}
        </span>
      </span>
    )
  }
  if (active) {
    const label =
      run.phase === 'starting'
        ? translate('components.native-chat.shellRun.status.starting', 'Starting…')
        : run.phase === 'stopping'
          ? translate('components.native-chat.shellRun.status.stopping', 'Stopping…')
          : translate('components.native-chat.shellRun.status.running', 'Running…')
    return (
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <Loader2 className="size-3.5 shrink-0 animate-spin" />
        {label}
      </span>
    )
  }
  if (run.phase === 'unverifiable' || run.phase === 'error') {
    const Icon = run.phase === 'error' ? CircleAlert : CircleHelp
    const lead =
      run.phase === 'error'
        ? translate('components.native-chat.shellRun.status.notStarted', 'Not started')
        : translate('components.native-chat.shellRun.status.unverifiable', 'Unverifiable')
    return (
      <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
        <Icon className="size-3.5 shrink-0" />
        <span className="truncate">
          {lead}
          {run.problem ? ` · ${nativeChatShellRunProblemText(run.problem)}` : ''}
        </span>
      </span>
    )
  }
  const succeeded = run.phase === 'succeeded'
  const Icon = succeeded ? Check : run.phase === 'stopped' ? Square : X
  return (
    <span
      data-run-result={run.phase}
      className={
        succeeded
          ? 'flex items-center gap-1.5 font-medium text-status-success'
          : run.phase === 'stopped'
            ? 'flex items-center gap-1.5 font-medium text-muted-foreground'
            : 'flex items-center gap-1.5 font-medium text-destructive'
      }
    >
      <Icon className="size-3.5 shrink-0" />
      <span className="tabular-nums">{nativeChatShellRunResultText(run)}</span>
    </span>
  )
}

/** The run's status line and a fixed-height, read-only copy of its terminal output. */
export function NativeChatShellRunOutput({
  run,
  hostLost,
  onOpenTerminal
}: {
  run: NativeChatShellRunState
  hostLost: boolean
  onOpenTerminal: (() => void) | null
}): React.JSX.Element {
  const paneRef = useRef<HTMLDivElement>(null)
  const atBottomRef = useRef(true)
  const needsInput = run.phase === 'running' && run.needsInput !== null

  // Follows new output only while the reader is at the bottom; scrolling up pins the view.
  useLayoutEffect(() => {
    const pane = paneRef.current
    if (pane && atBottomRef.current) {
      pane.scrollTop = pane.scrollHeight
    }
  }, [run.output])

  const empty =
    run.phase === 'starting' || run.phase === 'running' || run.phase === 'stopping'
      ? translate('components.native-chat.shellRun.waitingForOutput', 'Waiting for output…')
      : translate('components.native-chat.shellRun.noOutput', 'No output')

  return (
    <div data-native-chat-run-output="" className="border-t border-border/60">
      <div
        role="status"
        aria-live="polite"
        className="flex min-h-8 items-center justify-between gap-2 px-3 py-1 text-[12px]"
      >
        <RunStatus run={run} hostLost={hostLost} />
        {onOpenTerminal ? (
          <Button
            type="button"
            variant={needsInput ? 'outline' : 'ghost'}
            size="xs"
            className="shrink-0"
            onClick={onOpenTerminal}
          >
            <SquareTerminal />
            {needsInput
              ? translate('components.native-chat.shellRun.goToTerminal', 'Go to terminal')
              : translate('components.native-chat.shellRun.openInTerminal', 'Open in terminal')}
          </Button>
        ) : null}
      </div>
      <div
        ref={paneRef}
        role="log"
        aria-label={translate('components.native-chat.shellRun.outputLabel', 'Run output')}
        // Focusable so the keyboard can scroll it; it holds text only and never takes input.
        tabIndex={0}
        onScroll={(event) => {
          const pane = event.currentTarget
          atBottomRef.current =
            pane.scrollHeight - pane.scrollTop - pane.clientHeight <= STICK_SLOP_PX
        }}
        className="scrollbar-sleek h-48 overflow-y-auto whitespace-pre-wrap break-words border-t border-border/40 px-3 py-2 font-mono text-[12px] leading-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60"
      >
        {run.truncated ? (
          <div className="mb-1 text-muted-foreground">
            {translate(
              'components.native-chat.shellRun.truncated',
              'Earlier output is in the terminal.'
            )}
          </div>
        ) : null}
        {run.output ? (
          <AnsiText text={run.output} />
        ) : (
          <span className="text-muted-foreground">{empty}</span>
        )}
      </div>
    </div>
  )
}
