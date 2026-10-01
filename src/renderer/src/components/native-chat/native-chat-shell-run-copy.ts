// What the Run button says. Each line describes only what Orca observed: a run with
// no end marker is never called finished, failed or stopped.

import { translate } from '@/i18n/i18n'
import type { NativeChatShellRunRiskId } from '../../../../shared/native-chat-shell-run-risk'
import type {
  NativeChatShellRunProblem,
  NativeChatShellRunState
} from '../../../../shared/native-chat-shell-run-state'
import type { NativeChatShellRunInputKind } from '../../../../shared/native-chat-shell-run-output'
import { nativeChatShellRunDurationMs } from '../../../../shared/native-chat-shell-run-state'
import type { NativeChatShellRunUnavailable } from './native-chat-shell-run-workspace'

const RISK_LABELS: Record<NativeChatShellRunRiskId, string> = {
  sudo: 'Runs with administrator rights (sudo)',
  delete: 'Deletes files',
  'git-push': 'Pushes commits to a remote',
  'git-rewrite': 'Rewrites git history',
  'git-discard': 'Discards git changes',
  force: 'Uses --force',
  install: 'Installs or removes packages',
  'package-run': 'Downloads and runs a package',
  docker: 'Removes Docker containers, images or data',
  keychain: 'Uses the macOS Keychain (security)',
  'network-send': 'Sends data off this Mac',
  'remote-shell': 'Connects to another machine',
  publish: 'Publishes, deploys or uploads',
  cloud: 'Uses a cloud or cluster CLI',
  eval: 'Runs a string as code (eval)',
  exec: 'Replaces the shell (exec)',
  source: 'Runs another script Orca can’t read',
  'dynamic-command': 'Builds the command name at run time',
  'decode-pipe': 'Decodes hidden text and passes it on',
  'inline-code': 'Runs code from a string (-c / -e)',
  'pipe-to-shell': 'Pipes text into a shell or interpreter',
  'stdin-code': 'Feeds code to an interpreter',
  'alias-function': 'Defines aliases or functions',
  overwrite: 'Overwrites a file',
  append: 'Appends to a file',
  move: 'Moves or renames files',
  permissions: 'Changes permissions or owners recursively',
  kill: 'Stops processes',
  services: 'Changes background services',
  defaults: 'Changes macOS settings (defaults)',
  osascript: 'Runs AppleScript',
  disk: 'Writes to or formats disks',
  system: 'Changes system settings or restarts',
  unreadable: 'Orca couldn’t fully read this script'
}

export function nativeChatShellRunRiskLabel(id: NativeChatShellRunRiskId): string {
  return translate(`components.native-chat.shellRun.risk.${id}`, RISK_LABELS[id])
}

export function nativeChatShellRunUnavailableText(
  reason: NativeChatShellRunUnavailable,
  workspaceTarget: string | null
): string {
  switch (reason) {
    case 'no-workspace':
      return translate(
        'components.native-chat.shellRun.unavailable.noWorkspace',
        'This chat isn’t in a workspace Orca can run in.'
      )
    case 'unknown-workspace':
      return translate(
        'components.native-chat.shellRun.unavailable.unknownWorkspace',
        'Orca doesn’t know the workspace “{{value0}}”.',
        { value0: workspaceTarget ?? '' }
      )
    case 'no-posix-shell':
      return translate(
        'components.native-chat.shellRun.unavailable.noPosixShell',
        'Runs need a POSIX shell, and Git Bash isn’t installed.'
      )
    case 'host-unreachable':
      return translate(
        'components.native-chat.shellRun.unavailable.hostUnreachable',
        'The SSH host for this workspace isn’t connected.'
      )
  }
}

export function nativeChatShellRunBusyText(): string {
  return translate(
    'components.native-chat.shellRun.unavailable.workspaceBusy',
    'Another block is running in this workspace’s Runs terminal.'
  )
}

export function formatNativeChatShellRunDuration(ms: number): string {
  if (ms < 60_000) {
    return `${(ms / 1000).toFixed(1)}s`
  }
  const minutes = Math.floor(ms / 60_000)
  const seconds = Math.floor((ms % 60_000) / 1000)
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`
}

const PROBLEM_TEXT: Record<NativeChatShellRunProblem, string> = {
  'terminal-busy': 'The Runs terminal is busy with another command.',
  'workspace-busy': 'Another block is running in this workspace’s Runs terminal.',
  'start-failed': 'Orca couldn’t start the run.',
  'lost-output': 'Orca lost the output before the run ended. It may still be running.',
  reloaded: 'Orca reloaded during this run, so it can’t say how it ended.',
  'stop-unconfirmed': 'Stop was sent, but the run hasn’t confirmed it ended.',
  'host-unreachable': 'Lost contact with the host. The run may still be going.'
}

export function nativeChatShellRunProblemText(problem: NativeChatShellRunProblem): string {
  return translate(`components.native-chat.shellRun.problem.${problem}`, PROBLEM_TEXT[problem])
}

const INPUT_TEXT: Record<NativeChatShellRunInputKind, string> = {
  secret: 'Asking for a password',
  confirm: 'Asking to confirm',
  key: 'Waiting for a key press',
  prompt: 'The output ends in a prompt'
}

export function nativeChatShellRunInputText(kind: NativeChatShellRunInputKind): string {
  return translate(`components.native-chat.shellRun.input.${kind}`, INPUT_TEXT[kind])
}

/** The status line's words for a run Orca saw end. */
export function nativeChatShellRunResultText(run: NativeChatShellRunState): string {
  const duration = nativeChatShellRunDurationMs(run)
  const parts = [
    run.phase === 'stopped'
      ? translate('components.native-chat.shellRun.status.stopped', 'Stopped')
      : null,
    run.exitCode === null
      ? null
      : translate('components.native-chat.shellRun.status.exit', 'Exit {{value0}}', {
          value0: String(run.exitCode)
        }),
    duration === null ? null : formatNativeChatShellRunDuration(duration)
  ]
  return parts.filter((part) => part !== null).join(' · ')
}
