// Subcommand-aware risks for the CLIs whose danger depends on what they are asked to
// do (`git push` vs `git status`, `npm install` vs `npm test`).

import type { ShellWord } from './native-chat-shell-run-lexer'
import { hasFlag, positionalArgs, subcommandOf } from './native-chat-shell-run-command-words'
import type { NativeChatShellRunRiskId } from './native-chat-shell-run-risk-ids'

type Risk = NativeChatShellRunRiskId

export function wordSet(list: string): ReadonlySet<string> {
  return new Set(list.split(' '))
}

export const PUBLISH_WORDS = /^(deploy|publish|release|upload|submit)(:|$)/

const GIT_VALUE_OPTIONS = wordSet('-C -c --git-dir --work-tree --namespace --exec-path')
const GIT_FORCE = ['-f', '--force', '--force-with-lease', '--force-if-includes', '--mirror']
const JS_INSTALL = wordSet('i install add ci uninstall remove rm un update up upgrade link global')
const JS_PUBLISH = wordSet('publish unpublish deprecate dist-tag owner access login adduser token')
const JS_PACKAGE_RUN = wordSet('dlx create x')
const PY_INSTALL = wordSet('install uninstall add remove sync update upgrade tool')
const NATIVE_INSTALL = wordSet('install uninstall update add get remove')
const NATIVE_PUBLISH = wordSet('push publish yank trunk')
const BREW_READ_ONLY = wordSet(
  'list ls info search doctor config outdated deps desc home leaves uses commands help missing cat log shellenv --prefix --cellar --repository --version'
)
const GH_MUTATING = wordSet(
  'create merge close edit comment review ready delete transfer reopen rename archive unarchive fork sync set add remove run rerun cancel enable disable upload lock unlock pin unpin develop login logout refresh setup-git approve revoke note update publish'
)
const GH_RELEASE_READ_ONLY = wordSet('list view download')
const CURL_SEND_FLAGS = [
  '-d',
  '--data',
  '--data-binary',
  '--data-raw',
  '--data-urlencode',
  '--json',
  '-F',
  '--form',
  '--form-string',
  '-T',
  '--upload-file'
]
const WGET_SEND_FLAGS = ['--post-data', '--post-file', '--method', '--body-data', '--body-file']

export function gitRisks(args: readonly ShellWord[]): Risk[] {
  const { name, rest } = subcommandOf(args, GIT_VALUE_OPTIONS)
  const first = positionalArgs(rest)[0] ?? ''
  const risks: Risk[] = []
  if (name === 'push') {
    risks.push('git-push', 'network-send')
    const refspecRewrites = rest.some((arg) => /^[+:]/.test(arg.text))
    if (hasFlag(rest, ...GIT_FORCE, '--delete', '-d', '--prune') || refspecRewrites) {
      risks.push('git-rewrite')
    }
  }
  if (name === 'reset' && hasFlag(rest, '--hard', '--merge', '--keep')) {
    risks.push('git-rewrite', 'git-discard')
  }
  if (name !== null && wordSet('rebase filter-branch filter-repo replace update-ref').has(name)) {
    risks.push('git-rewrite')
  }
  if (
    (name === 'commit' && hasFlag(rest, '--amend')) ||
    (name === 'reflog' && (first === 'expire' || first === 'delete')) ||
    (name === 'gc' && hasFlag(rest, '--prune'))
  ) {
    risks.push('git-rewrite')
  }
  if (name === 'clean' || name === 'rm' || (name === 'worktree' && first === 'remove')) {
    risks.push('delete')
  }
  const discardsCheckout =
    name === 'checkout' && rest.some((a) => a.text === '--' || a.text === '.')
  if (
    discardsCheckout ||
    (name === 'restore' && !hasFlag(rest, '--staged', '-S')) ||
    (name === 'stash' && (first === 'drop' || first === 'clear')) ||
    (name === 'branch' && hasFlag(rest, '-D', '-d', '--delete')) ||
    (name === 'tag' && hasFlag(rest, '-d', '--delete'))
  ) {
    risks.push('git-discard')
  }
  return risks
}

export function jsPackageRisks(name: string, args: readonly ShellWord[]): Risk[] {
  const { name: sub, rest } = subcommandOf(args)
  const risks: Risk[] = []
  if (hasFlag(args, '-g', '--global') || (name === 'yarn' && sub === null)) {
    risks.push('install')
  }
  if (sub !== null && JS_INSTALL.has(sub)) {
    risks.push('install')
  }
  if (sub !== null && (JS_PUBLISH.has(sub) || sub === 'deploy')) {
    risks.push('publish', 'network-send')
  }
  if ((sub !== null && JS_PACKAGE_RUN.has(sub)) || (name === 'npm' && sub === 'exec')) {
    risks.push('package-run')
  }
  if (
    (sub === 'run' || sub === 'run-script') &&
    PUBLISH_WORDS.test(positionalArgs(rest)[0] ?? '')
  ) {
    risks.push('publish')
  }
  return risks
}

export function packageManagerRisks(name: string, args: readonly ShellWord[]): Risk[] {
  const sub = subcommandOf(args).name
  const risks: Risk[] = []
  if (name === 'brew' && sub !== null && !BREW_READ_ONLY.has(sub)) {
    risks.push(sub === 'services' ? 'services' : 'install')
  }
  if (/^(pip[\d.]*|pipx|uv|poetry|conda|mamba)$/.test(name) && sub !== null) {
    if (PY_INSTALL.has(sub)) {
      risks.push('install')
    }
    if (sub === 'publish') {
      risks.push('publish', 'network-send')
    }
    if ((name === 'pipx' || name === 'uv') && sub === 'run') {
      risks.push('package-run')
    }
  }
  const pipModule = args.some(
    (arg, i) => arg.text === '-m' && (args[i + 1]?.text ?? '').startsWith('pip')
  )
  if (/^python[\d.]*$/.test(name) && pipModule && hasFlag(args, 'install', 'uninstall')) {
    risks.push('install')
  }
  if (/^(gem|cargo|go|bundle|pod)$/.test(name) && sub !== null) {
    if (NATIVE_INSTALL.has(sub)) {
      risks.push('install')
    }
    if (NATIVE_PUBLISH.has(sub)) {
      risks.push('publish', 'network-send')
    }
  }
  return risks
}

export function sendsHttpBody(name: string, args: readonly ShellWord[]): boolean {
  if (name === 'wget') {
    return hasFlag(args, ...WGET_SEND_FLAGS)
  }
  const nonReadMethod = args.some((arg, index) => {
    const method =
      arg.text === '-X' || arg.text === '--request'
        ? args[index + 1]?.text
        : /^-X./.test(arg.text)
          ? arg.text.slice(2)
          : null
    return method != null && !/^(GET|HEAD|OPTIONS)$/i.test(method)
  })
  return nonReadMethod || hasFlag(args, ...CURL_SEND_FLAGS)
}

export function hostedGitRisks(args: readonly ShellWord[]): Risk[] {
  const [group, action = ''] = positionalArgs(args)
  const releaseWrite = group === 'release' && !GH_RELEASE_READ_ONLY.has(action)
  return group === 'api' || releaseWrite || GH_MUTATING.has(action) ? ['network-send'] : []
}

export function dockerRisks(args: readonly ShellWord[]): Risk[] {
  const removes = args.some(
    (arg) =>
      wordSet('rm rmi prune kill').has(arg.text) ||
      (arg.text === 'down' && hasFlag(args, '-v', '--volumes', '--rmi'))
  )
  const risks: Risk[] = removes ? ['docker'] : []
  if (subcommandOf(args).name === 'push') {
    risks.push('publish', 'network-send')
  }
  return risks
}
