// A conservative shell lexer for the chat Run button's risk check. It splits a block
// into simple commands (words + redirects) the way sh would, and surfaces everything
// that hides a command — substitutions, here-doc bodies, `sh -c` strings — as nested
// source the caller lexes too. It never evaluates anything; where it cannot follow
// the text it says so through `complete: false`.

export type ShellWord = {
  text: string
  /** Built from $VAR, $(...), `...`, $'...', brace or glob syntax: its runtime value is unknown. */
  dynamic: boolean
}

export type ShellRedirect = {
  op: string
  target: string
  /** The target came from an expansion, so where it writes is unknown. */
  dynamicTarget: boolean
}

export type ShellCommand = {
  words: ShellWord[]
  redirects: ShellRedirect[]
  /** Reads a pipe from the command before it. */
  pipedFrom: boolean
  /** Writes into a pipe to the command after it. */
  pipesTo: boolean
}

export type ShellLexResult = {
  commands: ShellCommand[]
  /** Source hidden inside this text: substitutions and here-doc bodies, to lex in turn. */
  nested: string[]
  /** False when a quote, substitution or here-doc never closed. */
  complete: boolean
}

import {
  collectSubstitutions,
  findClosingBacktick,
  findClosingDoubleQuote,
  isBraceExpansion,
  readBalanced,
  readHereDocBody
} from './native-chat-shell-run-quote-scan'

type Draft = {
  words: ShellWord[]
  redirects: ShellRedirect[]
  pipedFrom: boolean
}

const REDIRECT_START = /^(&>>|&>|>>|>\||>&|>|<<<|<<-|<<|<&|<>|<)/

export function lexShell(source: string): ShellLexResult {
  const commands: ShellCommand[] = []
  const nested: string[] = []
  let complete = true
  let draft: Draft = { words: [], redirects: [], pipedFrom: false }
  let word = ''
  let wordStarted = false
  let wordDynamic = false
  let pendingRedirect: { op: string } | null = null
  const pendingHereDocs: { delimiter: string; stripTabs: boolean }[] = []

  const finishWord = (): void => {
    if (!wordStarted) {
      return
    }
    const finished: ShellWord = { text: word, dynamic: wordDynamic }
    word = ''
    wordStarted = false
    wordDynamic = false
    if (pendingRedirect) {
      const { op } = pendingRedirect
      pendingRedirect = null
      if (op === '<<' || op === '<<-') {
        pendingHereDocs.push({
          delimiter: finished.text,
          stripTabs: op === '<<-'
        })
      }
      draft.redirects.push({
        op,
        target: finished.text,
        dynamicTarget: finished.dynamic
      })
      return
    }
    // Reserved braces group commands; they are boundaries, not words.
    if ((finished.text === '{' || finished.text === '}') && !finished.dynamic) {
      finishCommand(false)
      return
    }
    draft.words.push(finished)
  }

  const finishCommand = (pipesTo: boolean): void => {
    if (draft.words.length > 0 || draft.redirects.length > 0) {
      commands.push({ ...draft, pipesTo })
    }
    draft = { words: [], redirects: [], pipedFrom: pipesTo }
  }

  const append = (text: string, dynamic = false): void => {
    word += text
    wordStarted = true
    wordDynamic ||= dynamic
  }

  let index = 0
  while (index < source.length) {
    const char = source[index]
    const next = source[index + 1]

    if (char === '\\') {
      if (next === '\n') {
        index += 2
        continue
      }
      if (next !== undefined) {
        append(next)
      }
      index += 2
      continue
    }
    if (char === "'") {
      const closing = source.indexOf("'", index + 1)
      if (closing === -1) {
        complete = false
        append(source.slice(index + 1))
        break
      }
      append(source.slice(index + 1, closing))
      index = closing + 1
      continue
    }
    if (char === '"') {
      const closing = findClosingDoubleQuote(source, index + 1)
      const body = source.slice(index + 1, closing === -1 ? source.length : closing)
      if (closing === -1) {
        complete = false
      }
      // A double-quoted $(...) or `...` still runs; hand it on as nested source.
      nested.push(...collectSubstitutions(body))
      append(body.replace(/\\(["\\$`\n])/g, '$1'), /[$`]/.test(body))
      if (closing === -1) {
        break
      }
      index = closing + 1
      continue
    }
    if (char === '$' && next === "'") {
      const closing = source.indexOf("'", index + 2)
      if (closing === -1) {
        complete = false
        break
      }
      append(source.slice(index, closing + 1), true)
      index = closing + 1
      continue
    }
    if (char === '$' && next === '(') {
      const arithmetic = source[index + 2] === '('
      const balanced = readBalanced(source, index + 2, '(', ')')
      if (!balanced) {
        complete = false
        break
      }
      if (!arithmetic) {
        nested.push(balanced.body)
      }
      append(source.slice(index, balanced.end), true)
      index = balanced.end
      continue
    }
    if (char === '$' && next === '{') {
      const balanced = readBalanced(source, index + 2, '{', '}')
      if (!balanced) {
        complete = false
        break
      }
      append(source.slice(index, balanced.end), true)
      index = balanced.end
      continue
    }
    if (char === '$' && next !== undefined && /[A-Za-z0-9_@*#?$!-]/.test(next)) {
      const match = /^\$(?:[A-Za-z_][A-Za-z0-9_]*|[0-9@*#?$!-])/.exec(source.slice(index))
      append(match?.[0] ?? '$', true)
      index += match?.[0].length ?? 1
      continue
    }
    if (char === '`') {
      const closing = findClosingBacktick(source, index + 1)
      if (closing === -1) {
        complete = false
        break
      }
      nested.push(source.slice(index + 1, closing))
      append(source.slice(index, closing + 1), true)
      index = closing + 1
      continue
    }
    if ((char === '<' || char === '>') && next === '(') {
      // Process substitution runs its body as a command.
      const balanced = readBalanced(source, index + 2, '(', ')')
      if (!balanced) {
        complete = false
        break
      }
      nested.push(balanced.body)
      append(source.slice(index, balanced.end), true)
      index = balanced.end
      continue
    }
    if (char === '#' && !wordStarted) {
      const lineEnd = source.indexOf('\n', index)
      index = lineEnd === -1 ? source.length : lineEnd
      continue
    }
    if (char === ' ' || char === '\t') {
      finishWord()
      index += 1
      continue
    }
    if (char === '\n') {
      finishWord()
      finishCommand(false)
      index += 1
      // Here-doc bodies start on the line after their redirect.
      for (const hereDoc of pendingHereDocs.splice(0)) {
        const read = readHereDocBody(source, index, hereDoc.delimiter, hereDoc.stripTabs)
        complete &&= read.closed
        nested.push(read.body)
        index = read.end
      }
      continue
    }
    if (char === ';' || char === '(' || char === ')') {
      finishWord()
      finishCommand(false)
      index += char === ';' && next === ';' ? 2 : 1
      continue
    }
    if (char === '|') {
      finishWord()
      if (next === '|') {
        finishCommand(false)
        index += 2
        continue
      }
      finishCommand(true)
      index += next === '&' ? 2 : 1
      continue
    }
    if (char === '&' && next === '&') {
      finishWord()
      finishCommand(false)
      index += 2
      continue
    }
    if (char === '&' && next !== '>') {
      finishWord()
      finishCommand(false)
      index += 1
      continue
    }
    const fdPrefix = /^\d+$/.test(word) && !wordDynamic
    const redirect = REDIRECT_START.exec(source.slice(index))
    if (redirect && (char === '<' || char === '>' || char === '&')) {
      if (fdPrefix) {
        word = ''
        wordStarted = false
      } else {
        finishWord()
      }
      const op = redirect[1]
      index += redirect[0].length
      // `>&2` and `2>&1` duplicate a descriptor; they write no file.
      const dup = /^\s*(\d+|-)(?=$|[\s;|&)])/.exec(source.slice(index))
      if ((op === '>&' || op === '<&') && dup) {
        index += dup[0].length
        continue
      }
      pendingRedirect = { op }
      continue
    }
    // Brace and glob syntax rewrite a word before it runs.
    append(char, char === '*' || char === '?' || char === '[' || isBraceExpansion(source, index))
    index += 1
  }
  finishWord()
  if (pendingRedirect) {
    complete = false
  }
  finishCommand(false)
  if (pendingHereDocs.length > 0) {
    complete = false
  }
  return { commands, nested, complete }
}
