// Per-command rules for the chat Run button's confirmation. A denylist, so anything
// it cannot read with confidence is a risk too. Hardcoded on purpose: nothing a chat
// receives may change what asks first.

import type { ShellCommand, ShellRedirect } from './native-chat-shell-run-lexer'
import {
  hasFlag,
  positionalArgs,
  subcommandOf,
  type ResolvedShellCommand
} from './native-chat-shell-run-command-words'
import type { NativeChatShellRunRiskId } from './native-chat-shell-run-risk-ids'
import {
  PUBLISH_WORDS,
  dockerRisks,
  gitRisks,
  hostedGitRisks,
  jsPackageRisks,
  packageManagerRisks,
  sendsHttpBody,
  wordSet
} from './native-chat-shell-run-tool-risks'

type Risk = NativeChatShellRunRiskId

export const SHELLS = wordSet('sh bash zsh dash ksh fish csh tcsh ash')
const INTERPRETER =
  /^(python[\d.]*|node|nodejs|ruby|perl|php|deno|bun|lua|rscript|tclsh|pwsh|powershell|osascript)$/
const JS_PACKAGE_MANAGERS = wordSet('npm pnpm yarn bun cnpm corepack')
const NULL_DEVICES = /^\/dev\/(null|stdout|stderr|tty|fd\/\d+)$/
const PUBLISH_NAME = /(^|[-_.])(deploy|publish|release|upload)([-_.]|$)/

// Command name -> risk, for commands that are a risk whatever their arguments.
const NAME_RISKS: readonly [ReadonlySet<string> | RegExp, Risk][] = [
  [wordSet('sudo su doas'), 'sudo'],
  [wordSet('rm rmdir unlink shred srm trash truncate'), 'delete'],
  [wordSet('mv'), 'move'],
  [wordSet('npx bunx pnpx uvx'), 'package-run'],
  [
    wordSet('apt apt-get yum dnf zypper pacman apk port snap flatpak mas softwareupdate installer'),
    'install'
  ],
  [wordSet('pkg choco winget scoop'), 'install'],
  [wordSet('security'), 'keychain'],
  [wordSet('scp sftp ftp nc netcat ncat socat telnet'), 'network-send'],
  [wordSet('ssh mosh autossh'), 'remote-shell'],
  [
    wordSet(
      'aws gcloud gsutil az kubectl helm terraform tofu pulumi vercel netlify firebase fly flyctl heroku wrangler serverless sls eas fastlane doctl railway supabase'
    ),
    'cloud'
  ],
  [wordSet('source .'), 'source'],
  [wordSet('function'), 'alias-function'],
  [wordSet('kill killall pkill skill'), 'kill'],
  [wordSet('launchctl systemctl service'), 'services'],
  [wordSet('osascript'), 'osascript'],
  [/^(dd|diskutil|fdisk|gpt|parted|wipefs|asr|mkfs.*|newfs.*)$/, 'disk'],
  [
    wordSet(
      'shutdown reboot halt poweroff nvram csrutil spctl tccutil pmset systemsetup networksetup scutil crontab sysctl dscl chsh'
    ),
    'system'
  ]
]

// Interpreter -> the flags that take program text instead of a file.
function inlineCodeFlags(name: string): string[] {
  if (SHELLS.has(name) || name.startsWith('python')) {
    return ['-c']
  }
  if (name === 'node' || name === 'nodejs' || name === 'bun') {
    return ['-e', '--eval', '-p', '--print']
  }
  if (name === 'pwsh' || name === 'powershell') {
    return ['-c', '-Command', '-EncodedCommand', '-e']
  }
  return name === 'perl' ? ['-e', '-E'] : name === 'php' ? ['-r'] : ['-e']
}

function redirectRisk(redirect: ShellRedirect): Risk | null {
  if (
    redirect.op.startsWith('<') ||
    (!redirect.dynamicTarget && NULL_DEVICES.test(redirect.target))
  ) {
    return null
  }
  return redirect.op.includes('>>') ? 'append' : 'overwrite'
}

function interpreterRisks(
  name: string,
  command: ResolvedShellCommand,
  shell: ShellCommand
): Risk[] {
  const { args } = command
  const isInterpreter = SHELLS.has(name) || INTERPRETER.test(name)
  if (!isInterpreter) {
    return []
  }
  const inline =
    hasFlag(args, ...inlineCodeFlags(name)) ||
    (name === 'deno' && subcommandOf(args).name === 'eval')
  if (inline) {
    return ['inline-code']
  }
  const risks: Risk[] = []
  const positional = positionalArgs(args)
  if (SHELLS.has(name) && positional.length > 0) {
    risks.push('source')
  }
  // A shell fed anything runs it; another interpreter only when no program file is named.
  const programFromStdin = SHELLS.has(name) || positional.length === 0 || positional.includes('-')
  const readsStdin = shell.redirects.some((r) => r.op.startsWith('<') && r.op !== '<&')
  if (programFromStdin && (shell.pipedFrom || readsStdin)) {
    risks.push(shell.pipedFrom ? 'pipe-to-shell' : 'stdin-code')
  }
  return risks
}

function argumentRisks(name: string, command: ResolvedShellCommand, shell: ShellCommand): Risk[] {
  const { args } = command
  const risks: Risk[] = []
  const flagged = (risk: Risk, condition: boolean): void => {
    if (condition) {
      risks.push(risk)
    }
  }
  flagged('alias-function', name === 'alias' && args.length > 0)
  flagged('delete', name === 'find' && hasFlag(args, '-delete'))
  flagged(
    'delete',
    name === 'rsync' && args.some((a) => /^--(delete|remove-source-files)/.test(a.text))
  )
  flagged('overwrite', /^(cp|ln|install)$/.test(name) && hasFlag(args, '-f', '--force'))
  if (name === 'tee' && args.some((a) => !a.text.startsWith('-') && !NULL_DEVICES.test(a.text))) {
    risks.push(hasFlag(args, '-a', '--append') ? 'append' : 'overwrite')
  }
  flagged(
    'force',
    args.some((a) => a.text === '--force' || a.text.startsWith('--force='))
  )
  flagged('network-send', (name === 'curl' || name === 'wget') && sendsHttpBody(name, args))
  flagged(
    'network-send',
    name === 'rsync' &&
      args.some((a) => /^[^/.~\s-][^\s/]*:/.test(a.text) || a.text.startsWith('rsync://'))
  )
  const publishWord = name !== 'git' && positionalArgs(args).some((arg) => PUBLISH_WORDS.test(arg))
  flagged('publish', PUBLISH_NAME.test(name) || publishWord)
  const decodes =
    (name === 'base64' && hasFlag(args, '-d', '--decode', '-D')) ||
    (name === 'xxd' && hasFlag(args, '-r')) ||
    (name === 'openssl' && hasFlag(args, '-d'))
  flagged('decode-pipe', decodes && shell.pipesTo)
  flagged(
    'permissions',
    /^(chmod|chown|chgrp|chflags)$/.test(name) && hasFlag(args, '-R', '--recursive')
  )
  flagged('overwrite', (name === 'sed' || name === 'perl') && hasFlag(args, '-i'))
  flagged(
    'overwrite',
    name === 'sed' && args.some((a) => a.text.startsWith('-i') || a.text.startsWith('--in-place'))
  )
  flagged(
    'inline-code',
    /^[gnm]?awk$/.test(name) &&
      args.some((a) => /system\s*\(|\|\s*getline|print[^;]*>/.test(a.text))
  )
  const gitAlias = args.some((a) => /^alias\./i.test(a.text))
  flagged('alias-function', name === 'git' && gitAlias)
  const defaultsWrite = wordSet('write delete import rename').has(subcommandOf(args).name ?? '')
  flagged('defaults', name === 'defaults' && defaultsWrite)
  return risks
}

/** Risks of one simple command, as resolved past its wrappers. */
export function shellCommandRisks(command: ResolvedShellCommand, shell: ShellCommand): Risk[] {
  const risks: Risk[] = []
  for (const wrapper of command.wrappers) {
    if (wrapper === 'sudo' || wrapper === 'doas') {
      risks.push('sudo')
    } else if (wrapper === 'exec' || wrapper === 'eval') {
      risks.push(wrapper)
    }
  }
  for (const redirect of shell.redirects) {
    const risk = redirectRisk(redirect)
    if (risk) {
      risks.push(risk)
    }
  }
  if (command.dynamicName) {
    risks.push('dynamic-command')
  }
  const { name, args } = command
  if (name === null) {
    return risks
  }
  for (const [match, risk] of NAME_RISKS) {
    if (match instanceof RegExp ? match.test(name) : match.has(name)) {
      risks.push(risk)
    }
  }
  risks.push(...interpreterRisks(name, command, shell), ...argumentRisks(name, command, shell))
  if (name === 'git') {
    risks.push(...gitRisks(args))
  }
  if (JS_PACKAGE_MANAGERS.has(name)) {
    risks.push(...jsPackageRisks(name, args))
  }
  risks.push(...packageManagerRisks(name, args))
  if (name === 'gh' || name === 'glab') {
    risks.push(...hostedGitRisks(args))
  }
  if (name === 'docker' || name === 'podman' || name === 'nerdctl') {
    risks.push(...dockerRisks(args))
  }
  return risks
}
