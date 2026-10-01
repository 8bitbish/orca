// Quote-, substitution- and here-doc-aware scanning for the chat Run button's shell lexer.

export function readBalanced(
  source: string,
  start: number,
  open: string,
  close: string
): { body: string; end: number } | null {
  let depth = 1
  let index = start
  while (index < source.length) {
    const char = source[index]
    if (char === '\\') {
      index += 2
      continue
    }
    if (char === "'") {
      const closing = source.indexOf("'", index + 1)
      if (closing === -1) {
        return null
      }
      index = closing + 1
      continue
    }
    if (char === '"') {
      const closing = findClosingDoubleQuote(source, index + 1)
      if (closing === -1) {
        return null
      }
      index = closing + 1
      continue
    }
    if (char === open) {
      depth += 1
    } else if (char === close) {
      depth -= 1
      if (depth === 0) {
        return { body: source.slice(start, index), end: index + 1 }
      }
    }
    index += 1
  }
  return null
}

export function findClosingDoubleQuote(source: string, start: number): number {
  for (let index = start; index < source.length; index += 1) {
    const char = source[index]
    if (char === '\\') {
      index += 1
    } else if (char === '"') {
      return index
    } else if (char === '$' && source[index + 1] === '(') {
      // Quotes inside $(...) belong to the substitution, not to this string.
      const balanced = readBalanced(source, index + 2, '(', ')')
      if (!balanced) {
        return -1
      }
      index = balanced.end - 1
    } else if (char === '`') {
      const closing = findClosingBacktick(source, index + 1)
      if (closing === -1) {
        return -1
      }
      index = closing
    }
  }
  return -1
}

export function findClosingBacktick(source: string, start: number): number {
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === '\\') {
      index += 1
    } else if (source[index] === '`') {
      return index
    }
  }
  return -1
}

export function isBraceExpansion(source: string, index: number): boolean {
  if (source[index] !== '{') {
    return false
  }
  const closing = source.indexOf('}', index)
  const body = closing === -1 ? '' : source.slice(index + 1, closing)
  return body.includes(',') || body.includes('..')
}

export function collectSubstitutions(body: string): string[] {
  const found: string[] = []
  for (let index = 0; index < body.length; index += 1) {
    if (body[index] === '\\') {
      index += 1
    } else if (body[index] === '$' && body[index + 1] === '(') {
      const balanced = readBalanced(body, index + 2, '(', ')')
      if (balanced) {
        found.push(balanced.body)
        index = balanced.end - 1
      }
    } else if (body[index] === '`') {
      const closing = findClosingBacktick(body, index + 1)
      if (closing !== -1) {
        found.push(body.slice(index + 1, closing))
        index = closing
      }
    }
  }
  return found
}

/** Reads one here-doc body from `start`; `end` is just past its delimiter line. */
export function readHereDocBody(
  source: string,
  start: number,
  delimiter: string,
  stripTabs: boolean
): { body: string; end: number; closed: boolean } {
  const lines: string[] = []
  let index = start
  while (index < source.length) {
    const lineEnd = source.indexOf('\n', index)
    const line = source.slice(index, lineEnd === -1 ? source.length : lineEnd)
    index = lineEnd === -1 ? source.length : lineEnd + 1
    if ((stripTabs ? line.replace(/^\t+/, '') : line) === delimiter) {
      return { body: lines.join('\n'), end: index, closed: true }
    }
    lines.push(line)
  }
  return { body: lines.join('\n'), end: index, closed: false }
}
