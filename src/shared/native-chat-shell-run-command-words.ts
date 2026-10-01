// What a lexed simple command actually runs: the command name once leading
// assignments and wrappers (`sudo`, `env`, `xargs`, `nohup`, ...) are peeled off,
// and the wrappers seen on the way, since some of them (`sudo`, `eval`, `exec`) are
// risks of their own.

import type { ShellWord } from './native-chat-shell-run-lexer'

export type ResolvedShellCommand = {
  /** Lower-cased basename, e.g. `/bin/RM` -> `rm`. Null for a bare assignment. */
  name: string | null
  /** The name came from an expansion or glob, so what runs is unknown. */
  dynamicName: boolean
  args: ShellWord[]
  wrappers: string[]
}

const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/
const RESERVED = new Set([
  '!',
  'if',
  'then',
  'else',
  'elif',
  'fi',
  'do',
  'done',
  'while',
  'until',
  'time',
  'coproc'
])
// Wrapper -> its options that take a separate value.
const WRAPPERS: Record<string, ReadonlySet<string>> = {
  sudo: new Set(['-u', '-g', '-h', '-p', '-C', '-U', '-D', '-R', '-T', '-r', '-t']),
  doas: new Set(['-u', '-C']),
  // `-S` is left out: its string becomes the command word, which the caller re-reads.
  env: new Set(['-u', '-P', '-C', '--unset', '--chdir']),
  command: new Set(),
  builtin: new Set(),
  nohup: new Set(),
  nice: new Set(['-n']),
  ionice: new Set(['-c', '-n', '-p']),
  timeout: new Set(['-s', '-k', '--signal', '--kill-after']),
  caffeinate: new Set(['-t', '-w']),
  stdbuf: new Set(['-i', '-o', '-e']),
  chronic: new Set(),
  unbuffer: new Set(),
  arch: new Set(),
  watch: new Set(['-n', '--interval']),
  xargs: new Set(['-I', '-i', '-n', '-P', '-L', '-l', '-s', '-d', '-E', '-e', '-a']),
  exec: new Set(['-a']),
  eval: new Set()
}
// After these, the next positional word is a value, not the command.
const POSITIONAL_VALUE_WRAPPERS = new Set(['timeout'])

export function shellCommandBasename(text: string): string {
  const parts = text.split('/')
  return (parts.at(-1) ?? text).toLowerCase()
}

export function resolveShellCommand(words: readonly ShellWord[]): ResolvedShellCommand {
  const wrappers: string[] = []
  let index = 0
  while (index < words.length) {
    const word = words[index]
    if (!word.dynamic && ASSIGNMENT.test(word.text)) {
      index += 1
      continue
    }
    const name = shellCommandBasename(word.text)
    if (!word.dynamic && RESERVED.has(name)) {
      index += 1
      continue
    }
    const valueOptions = word.dynamic ? undefined : WRAPPERS[name]
    if (!valueOptions) {
      break
    }
    wrappers.push(name)
    index += 1
    if (name === 'eval') {
      // eval's words are re-read as source by the caller; nothing here runs directly.
      return {
        name: null,
        dynamicName: false,
        args: words.slice(index),
        wrappers
      }
    }
    let skippedValue = false
    while (index < words.length) {
      const option = words[index].text
      if (option === '--') {
        index += 1
        break
      }
      if (option.startsWith('-') && option.length > 1) {
        index += valueOptions.has(option) ? 2 : 1
        continue
      }
      if (name === 'env' && ASSIGNMENT.test(option)) {
        index += 1
        continue
      }
      if (POSITIONAL_VALUE_WRAPPERS.has(name) && !skippedValue) {
        skippedValue = true
        index += 1
        continue
      }
      break
    }
  }
  const nameWord = words[index]
  if (!nameWord) {
    return { name: null, dynamicName: false, args: [], wrappers }
  }
  return {
    name: shellCommandBasename(nameWord.text),
    dynamicName: nameWord.dynamic,
    args: words.slice(index + 1),
    wrappers
  }
}

export function positionalArgs(args: readonly ShellWord[]): string[] {
  return args.filter((arg) => !arg.text.startsWith('-')).map((arg) => arg.text)
}

export function hasFlag(args: readonly ShellWord[], ...flags: string[]): boolean {
  return args.some((arg) => {
    const text = arg.text
    if (flags.includes(text) || flags.some((flag) => text.startsWith(`${flag}=`))) {
      return true
    }
    // Clustered short flags: `-rf` carries `-r` and `-f`.
    return (
      /^-[A-Za-z]{2,}$/.test(text) &&
      flags.some((flag) => /^-[A-Za-z]$/.test(flag) && text.includes(flag[1]))
    )
  })
}

/** The first positional word after a CLI's global options, e.g. `git -C dir push` -> `push`. */
export function subcommandOf(
  args: readonly ShellWord[],
  valueOptions: ReadonlySet<string> = new Set()
): { name: string | null; rest: ShellWord[] } {
  for (let index = 0; index < args.length; index += 1) {
    const text = args[index].text
    if (text.startsWith('-')) {
      if (valueOptions.has(text)) {
        index += 1
      }
      continue
    }
    return { name: text.toLowerCase(), rest: args.slice(index + 1) }
  }
  return { name: null, rest: [] }
}
