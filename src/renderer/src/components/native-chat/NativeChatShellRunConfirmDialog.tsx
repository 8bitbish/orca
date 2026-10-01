import { useRef } from 'react'
import { ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { translate } from '@/i18n/i18n'
import type { NativeChatShellRunRisk } from '../../../../shared/native-chat-shell-run-risk'
import { nativeChatShellRunRiskLabel } from './native-chat-shell-run-copy'

/**
 * Asks before a risky block runs: which risks the check found, the command that
 * raised each, and the whole script. Cancel holds focus, so Enter never runs it.
 */
export function NativeChatShellRunConfirmDialog({
  risks,
  script,
  workspaceLabel,
  onRun,
  onCancel
}: {
  risks: readonly NativeChatShellRunRisk[] | null
  script: string
  workspaceLabel: string | null
  onRun: (event: React.MouseEvent) => void
  onCancel: () => void
}): React.JSX.Element {
  const cancelRef = useRef<HTMLButtonElement>(null)
  return (
    <Dialog open={risks !== null} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent
        data-native-chat-run-confirm=""
        className="sm:max-w-lg"
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          cancelRef.current?.focus()
        }}
      >
        <DialogHeader>
          <div className="flex items-center gap-2">
            <ShieldAlert className="size-5 shrink-0 text-agent-question" aria-hidden />
            <DialogTitle>
              {translate('components.native-chat.shellRun.confirm.title', 'Run this command?')}
            </DialogTitle>
          </div>
          <DialogDescription>
            {workspaceLabel
              ? translate(
                  'components.native-chat.shellRun.confirm.descriptionIn',
                  'It runs in {{value0}} and can change things outside this chat.',
                  { value0: workspaceLabel }
                )
              : translate(
                  'components.native-chat.shellRun.confirm.description',
                  'It can change things outside this chat.'
                )}
          </DialogDescription>
        </DialogHeader>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {(risks ?? []).map((risk) => (
            <li key={risk.id} data-run-risk={risk.id} className="min-w-0 text-sm">
              <div className="font-medium">{nativeChatShellRunRiskLabel(risk.id)}</div>
              <code className="block truncate font-mono text-[12px] text-muted-foreground">
                {risk.evidence}
              </code>
            </li>
          ))}
        </ul>
        <pre className="scrollbar-sleek m-0 max-h-48 overflow-auto rounded-md bg-accent p-3 font-mono text-[12px] leading-5 whitespace-pre-wrap break-words">
          {script}
        </pre>
        <DialogFooter>
          <Button ref={cancelRef} type="button" variant="ghost" onClick={onCancel}>
            {translate('components.native-chat.shellRun.confirm.cancel', 'Cancel')}
          </Button>
          <Button type="button" onClick={onRun}>
            {translate('components.native-chat.shellRun.confirm.run', 'Run')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
