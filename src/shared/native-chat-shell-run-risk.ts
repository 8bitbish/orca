// Whether a chat code block asks before it runs, and why. Reads the block as sh
// would, follows every place it can hide a command (substitutions, here-docs,
// `sh -c`, `eval`, `find -exec`, wrappers like `sudo` and `xargs`), and reports each
// risk once with the command that raised it. Pure and hardcoded: no input but the
// script itself decides the outcome.

import { lexShell, type ShellCommand } from './native-chat-shell-run-lexer'
import {
  resolveShellCommand,
  type ResolvedShellCommand
} from './native-chat-shell-run-command-words'
import { SHELLS, shellCommandRisks } from './native-chat-shell-run-risk-rules'
import {
  NATIVE_CHAT_SHELL_RUN_RISK_IDS,
  type NativeChatShellRunRiskId
} from './native-chat-shell-run-risk-ids'

export { NATIVE_CHAT_SHELL_RUN_RISK_IDS, type NativeChatShellRunRiskId }

export type NativeChatShellRunRisk = {
  id: NativeChatShellRunRiskId
  /** The command that raised it, as written (trimmed). */
  evidence: string
}

const MAX_NESTING = 6
const EVIDENCE_MAX = 160
const FUNCTION_DEFINITION =
  /(?:^|[\s;&|({])(function\s+[A-Za-z_][\w.:-]*|[A-Za-z_][\w.:-]*\s*\(\s*\))/m
const EXEC_PRIMARIES = new Set(['-exec', '-execdir', '-ok', '-okdir'])

function describe(command: ShellCommand): string {
  const words = command.words.map((word) => word.text)
  const redirects = command.redirects.map((redirect) => `${redirect.op} ${redirect.target}`)
  return [...words, ...redirects].join(' ').trim()
}

/** Source a command runs that is not one of its own words: `sh -c`, `eval`, `find -exec`. */
function innerSources(command: ShellCommand, resolved: ResolvedShellCommand): string[] {
  const sources: string[] = []
  const { name, args } = resolved
  if (resolved.wrappers.includes('eval')) {
    sources.push(args.map((arg) => arg.text).join(' '))
  }
  if (name !== null && (SHELLS.has(name) || name === 'su')) {
    const flagIndex = args.findIndex((arg) => /^-[A-Za-z]*c[A-Za-z]*$/.test(arg.text))
    if (flagIndex !== -1 && args[flagIndex + 1]) {
      sources.push(args[flagIndex + 1].text)
    }
  }
  if (name === 'trap' && args[0]) {
    sources.push(args[0].text)
  }
  if (name === 'find') {
    for (let index = 0; index < args.length; index += 1) {
      if (!EXEC_PRIMARIES.has(args[index].text)) {
        continue
      }
      const end = args.findIndex((arg, i) => i > index && (arg.text === ';' || arg.text === '+'))
      sources.push(
        args
          .slice(index + 1, end === -1 ? undefined : end)
          .map((arg) => arg.text)
          .join(' ')
      )
    }
  }
  // A quoted string in command position, e.g. `watch "rm -rf build"`.
  const nameWord = command.words.find((word) => word.text.includes(' '))
  if (nameWord && name !== null && name.includes(' ')) {
    sources.push(nameWord.text)
  }
  return sources
}

export function assessNativeChatShellRunRisks(script: string): NativeChatShellRunRisk[] {
  const found = new Map<NativeChatShellRunRiskId, string>()
  const add = (id: NativeChatShellRunRiskId, evidence: string): void => {
    if (!found.has(id)) {
      const trimmed = evidence.replace(/\s+/g, ' ').trim()
      found.set(
        id,
        trimmed.length > EVIDENCE_MAX ? `${trimmed.slice(0, EVIDENCE_MAX - 1)}…` : trimmed
      )
    }
  }
  const visit = (source: string, depth: number): void => {
    if (depth > MAX_NESTING) {
      add('unreadable', source)
      return
    }
    const lexed = lexShell(source)
    if (!lexed.complete) {
      add('unreadable', source.split('\n').find((line) => line.trim() !== '') ?? source)
    }
    const definition = FUNCTION_DEFINITION.exec(source)
    if (definition) {
      add('alias-function', definition[1])
    }
    for (const command of lexed.commands) {
      const resolved = resolveShellCommand(command.words)
      const evidence = describe(command)
      for (const id of shellCommandRisks(resolved, command)) {
        add(id, evidence)
      }
      for (const inner of innerSources(command, resolved)) {
        visit(inner, depth + 1)
      }
    }
    for (const nested of lexed.nested) {
      visit(nested, depth + 1)
    }
  }
  visit(script, 0)
  return NATIVE_CHAT_SHELL_RUN_RISK_IDS.flatMap((id) => {
    const evidence = found.get(id)
    return evidence === undefined ? [] : [{ id, evidence }]
  })
}
