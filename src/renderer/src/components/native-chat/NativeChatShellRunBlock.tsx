import { useContext, useMemo, useState } from 'react'
import { Code2, Play, RotateCcw, Square } from 'lucide-react'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { getCodeBlockLanguageLabel } from '@/components/editor/rich-markdown-code-block-languages'
import {
  nativeChatShellRunBlock,
  type NativeChatShellRunBlock as ShellRunBlock
} from '../../../../shared/native-chat-shell-run-block'
import {
  assessNativeChatShellRunRisks,
  type NativeChatShellRunRisk
} from '../../../../shared/native-chat-shell-run-risk'
import { isNativeChatShellRunActive } from '../../../../shared/native-chat-shell-run-state'
import { NativeChatCopyButton } from './NativeChatCopyButton'
import { NativeChatProjectChip } from './NativeChatProjectChip'
import { NativeChatShellRunConfirmDialog } from './NativeChatShellRunConfirmDialog'
import { NativeChatShellRunOutput } from './NativeChatShellRunOutput'
import { NativeChatFencePreviewContext, sameFenceBody } from './native-chat-fence-preview'
import { NATIVE_CHAT_WORKTREE_LINK_SCHEME } from './native-chat-project-target'
import { nativeChatShellRuns } from './native-chat-shell-runs'
import {
  nativeChatShellRunKey,
  useNativeChatShellRun,
  useNativeChatShellRunWorkspaceBusy
} from './native-chat-shell-run-store'
import { NativeChatShellRunContext } from './native-chat-shell-run-workspace'
import { useNativeChatShellRunWorkspace } from './use-native-chat-shell-run-workspace'
import {
  nativeChatShellRunBusyText,
  nativeChatShellRunUnavailableText
} from './native-chat-shell-run-copy'

const ACTION_CLASS =
  'flex h-6 shrink-0 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50'

/**
 * A shell fence in an agent reply, with a Run button. Run types the block into its
 * workspace's Runs terminal in the background and mirrors the output underneath.
 * Only a trusted click on this button starts a run.
 */
export function NativeChatShellRunBlock({
  language,
  code,
  body
}: {
  language: string | undefined
  code: string
  body: React.ReactNode
}): React.JSX.Element {
  const block = useMemo(() => nativeChatShellRunBlock(language, code), [code, language])
  const fences = useContext(NativeChatFencePreviewContext)
  const scope = useContext(NativeChatShellRunContext)
  const blockIndex = fences.fenceBodies?.findIndex((fence) => sameFenceBody(fence, code)) ?? -1
  const key =
    scope?.sessionId && fences.messageId && blockIndex >= 0
      ? nativeChatShellRunKey(scope.sessionId, fences.messageId, blockIndex)
      : null
  const resolution = useNativeChatShellRunWorkspace(block?.workspaceTarget ?? null)
  const run = useNativeChatShellRun(key)
  const worktreeId = resolution?.kind === 'ready' ? resolution.workspace.worktreeId : null
  const busy = useNativeChatShellRunWorkspaceBusy(worktreeId, key)
  const [risks, setRisks] = useState<readonly NativeChatShellRunRisk[] | null>(null)

  const active = isNativeChatShellRunActive(run.phase)
  const startRun = (runBlock: ShellRunBlock): void => {
    if (key !== null && resolution?.kind === 'ready') {
      void nativeChatShellRuns.start(key, runBlock, resolution.workspace)
    }
  }
  const onRun = (event: React.MouseEvent): void => {
    // Only the user's own click runs a block: not a script, not the agent.
    if (!event.isTrusted || !block) {
      return
    }
    const found = assessNativeChatShellRunRisks(block.script)
    if (found.length > 0) {
      setRisks(found)
      return
    }
    startRun(block)
  }
  const onConfirm = (event: React.MouseEvent): void => {
    setRisks(null)
    if (event.isTrusted && block) {
      startRun(block)
    }
  }
  const terminalHandle = run.terminalHandle
  const openTerminal =
    terminalHandle === null
      ? null
      : () => {
          const target =
            resolution?.kind === 'ready' ? resolution.workspace.target : { kind: 'local' as const }
          void nativeChatShellRuns.openTerminal(target, terminalHandle).then((opened) => {
            if (!opened) {
              toast.error(
                translate(
                  'components.native-chat.shellRun.terminalGone',
                  'That Runs terminal is gone.'
                )
              )
            }
          })
        }

  const unavailable =
    resolution?.kind === 'unavailable'
      ? nativeChatShellRunUnavailableText(resolution.reason, block?.workspaceTarget ?? null)
      : busy && !active
        ? nativeChatShellRunBusyText()
        : null
  const canRun = key !== null && resolution?.kind === 'ready' && !busy && !active
  const label = language
    ? getCodeBlockLanguageLabel(language)
    : translate('components.native-chat.shellRun.shell', 'Shell')
  const targetChip = block?.workspaceTarget ? (
    resolution?.target ? (
      <NativeChatProjectChip
        href={`${NATIVE_CHAT_WORKTREE_LINK_SCHEME}${encodeURIComponent(block.workspaceTarget)}`}
      />
    ) : (
      <span className="truncate font-mono text-[11px] text-muted-foreground">
        {block.workspaceTarget}
      </span>
    )
  ) : null

  return (
    <div
      data-native-chat-shell-run=""
      data-run-phase={run.phase}
      className="group/code relative my-3 min-w-0 max-w-full overflow-hidden rounded-md bg-accent"
    >
      <div className="flex h-9 items-center justify-between gap-2 border-b border-border/60 px-3">
        <span className="flex min-w-0 items-center gap-2">
          <span
            data-code-language={language ?? ''}
            className="flex shrink-0 items-center gap-1.5 font-mono text-[11px] text-muted-foreground"
          >
            <Code2 className="size-3.5 shrink-0" />
            {label}
          </span>
          {targetChip}
        </span>
        <span className="-mr-1 flex shrink-0 items-center gap-0.5">
          {active ? (
            <button
              type="button"
              className={ACTION_CLASS}
              disabled={run.phase === 'stopping'}
              onClick={() => key !== null && nativeChatShellRuns.stop(key)}
            >
              <Square className="size-3" />
              {translate('components.native-chat.shellRun.stop', 'Stop')}
            </button>
          ) : (
            <button
              type="button"
              className={ACTION_CLASS}
              disabled={!canRun}
              title={unavailable ?? undefined}
              onClick={onRun}
            >
              {run.phase === 'idle' ? (
                <Play className="size-3" />
              ) : (
                <RotateCcw className="size-3" />
              )}
              {run.phase === 'idle'
                ? translate('components.native-chat.shellRun.run', 'Run')
                : translate('components.native-chat.shellRun.runAgain', 'Run again')}
            </button>
          )}
          <NativeChatCopyButton
            text={code}
            label={translate('components.native-chat.copyCode', 'Copy code')}
          />
        </span>
      </div>
      {unavailable ? (
        <div
          data-run-unavailable=""
          className="border-b border-border/60 px-3 py-1.5 text-[12px] text-muted-foreground"
        >
          {unavailable}
        </div>
      ) : null}
      <pre className="scrollbar-sleek m-0 max-h-80 max-w-full overflow-x-auto p-3 font-mono text-[12px]">
        {body}
      </pre>
      {run.phase === 'idle' ? null : (
        <NativeChatShellRunOutput
          run={run}
          hostLost={resolution?.kind === 'unavailable' && resolution.reason === 'host-unreachable'}
          onOpenTerminal={openTerminal}
        />
      )}
      {block ? (
        <NativeChatShellRunConfirmDialog
          risks={risks}
          script={block.script}
          workspaceLabel={block.workspaceTarget}
          onRun={onConfirm}
          onCancel={() => setRisks(null)}
        />
      ) : null}
    </div>
  )
}
