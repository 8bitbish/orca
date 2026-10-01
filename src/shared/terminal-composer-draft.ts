export type TerminalCursorContext = {
  rows: string[]
  typedRows: string[]
  promptGlyphBoldRows: boolean[]
  rowsWrapped?: boolean[]
  rowsBelow: string[]
  typedRowsBelow: string[]
  rowsBelowWrapped?: boolean[]
  rowsBelowCustomForeground?: boolean[]
  beforeCursor: string
  afterCursor: string
  rawAfterCursor: string
  cursorHidden: boolean
  cursorViewportRow: number
}

export type TerminalComposerDraft = {
  text: string
  promptRow: number
  cursorRow: number
  endRow: number
  promptGlyph: '❯' | '›' | '»'
}

/** A composer prompt box on screen, typed or not. Dim cells are the agent's, not the user's:
 *  Claude Code paints a suggested next prompt (and a slash-command completion) in SGR 2. */
export type TerminalComposerPrompt = TerminalComposerDraft & {
  /** Nothing typed: a stock placeholder or a dim suggestion owns the prompt. */
  placeholder: boolean
  /** A stock placeholder, which projections leave in place (Codex reads it as chrome). */
  stockPlaceholder: boolean
  /** The dim suggestion an empty prompt shows; empty when anything is typed. */
  suggestion: string
}

/** One composer row: `text` is its typed cells, `raw` every cell, `legacy` typed-else-raw. */
type ComposerLine = { text: string; raw: string; legacy: string; wrapped: boolean }

const COMPOSER_FRAME_LINE = /^[─━-]{8,}\s*$/
const CODEX_FOOTER_LINE = /^\s*(?:gpt-\S+|o\d\S*)\s+[·•]\s+\S.*$/i

function composerContinuationRows(
  context: TerminalCursorContext,
  afterCursor: string,
  codexFooterIndex: number
): ComposerLine[] {
  if (!afterCursor.trim() && !context.typedRowsBelow.some((row) => row.trim())) {
    return []
  }
  const continuation: ComposerLine[] = []
  const hasTypedContinuationAfter = context.rowsBelow.map(() => false)
  let hasFollowingTyped = false
  for (let index = context.rowsBelow.length - 1; index >= 0; index -= 1) {
    const raw = context.rowsBelow[index] ?? ''
    if (COMPOSER_FRAME_LINE.test(raw) || index === codexFooterIndex) {
      hasFollowingTyped = false
      continue
    }
    hasTypedContinuationAfter[index] = hasFollowingTyped
    if ((context.typedRowsBelow[index] ?? '').trim()) {
      hasFollowingTyped = true
    }
  }
  for (let index = 0; index < context.rowsBelow.length; index += 1) {
    const raw = context.rowsBelow[index] ?? ''
    if (COMPOSER_FRAME_LINE.test(raw) || index === codexFooterIndex) {
      break
    }
    if (!raw.trim() && !hasTypedContinuationAfter[index]) {
      break
    }
    // A dim-only row still belongs to the prompt box (it extends `endRow`), but none of it was typed.
    const typed = context.typedRowsBelow[index] ?? ''
    continuation.push({
      text: typed,
      raw,
      legacy: typed.trim() ? typed : raw,
      wrapped: context.rowsBelowWrapped?.[index] ?? false
    })
  }
  return continuation
}

function findCodexFooterIndex(context: TerminalCursorContext): number {
  for (let index = context.rowsBelow.length - 1; index >= 0; index -= 1) {
    const row = context.rowsBelow[index] ?? ''
    if (!row.trim()) {
      continue
    }
    const undimmed = context.typedRowsBelow[index] ?? ''
    const hasFooterGap = index > 0 && !(context.rowsBelow[index - 1] ?? '').trim()
    const isDimmedFooter =
      hasFooterGap && !undimmed.trim() && context.rowsBelowWrapped?.[index] === false
    const isColoredFooter =
      hasFooterGap &&
      context.rowsBelowCustomForeground?.[index] === true &&
      context.rowsBelowWrapped?.[index] === false
    return isDimmedFooter || isColoredFooter || CODEX_FOOTER_LINE.test(row) ? index : -1
  }
  return -1
}

function isStockPlaceholder(afterCursor: string, continuationRows: ComposerLine[]): boolean {
  const text = [afterCursor, ...continuationRows.map((row) => row.raw)]
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
  return (
    /^Try\s+["“]/.test(text) ||
    text === 'Ask Codex to do anything' ||
    text === 'Ask a follow-up question'
  )
}

function joinComposerLines(lines: { text: string; wrapped: boolean }[]): string {
  return lines
    .map((line, lineIndex) => {
      const continuesPrevious = lineIndex > 0 && line.wrapped
      const continuesNext = lines[lineIndex + 1]?.wrapped ?? false
      const start = continuesPrevious ? '' : lineIndex > 0 ? '\n' : ''
      const content = continuesPrevious ? line.text : line.text.trimStart()
      return `${start}${continuesNext ? content : content.trimEnd()}`
    })
    .join('')
    .trim()
}

const PROMPT_GLYPH_PREFIX = /^\s*[❯›»]\s?/

/** The prompt box at the cursor, if one is on screen. `text` holds only what was typed. */
export function detectTerminalComposerPrompt(
  context: TerminalCursorContext | null | undefined
): TerminalComposerPrompt | null {
  if (!context || context.cursorHidden || context.rows.length === 0) {
    return null
  }
  const cursorIndex = context.rows.length - 1
  const codexFooterIndex = findCodexFooterIndex(context)
  let rawAfterCursor = context.afterCursor || context.rawAfterCursor
  let afterCursor = context.afterCursor
  let continuationRows = composerContinuationRows(context, rawAfterCursor, codexFooterIndex)
  const stockPlaceholder = isStockPlaceholder(rawAfterCursor, continuationRows)
  if (stockPlaceholder) {
    rawAfterCursor = ''
    afterCursor = ''
    continuationRows = []
  }
  for (let index = cursorIndex; index >= 0; index -= 1) {
    const row = context.rows[index] ?? ''
    const glyph = row.match(/^\s*([❯›»])/)?.[1] as '❯' | '›' | '»' | undefined
    if (glyph) {
      if (glyph === '❯' && !COMPOSER_FRAME_LINE.test(context.rows[index - 1] ?? '')) {
        return null
      }
      if (
        (glyph === '›' || glyph === '»') &&
        (context.promptGlyphBoldRows[index] !== true || codexFooterIndex === -1)
      ) {
        return null
      }
      const composerLines = (
        pick: 'text' | 'raw' | 'legacy'
      ): { text: string; wrapped: boolean }[] => {
        const cursorText = `${context.beforeCursor}${pick === 'text' ? afterCursor : rawAfterCursor}`
        const below = continuationRows.map((line) => ({ text: line[pick], wrapped: line.wrapped }))
        const rowsAbove = pick === 'raw' ? context.rows : context.typedRows
        return index === cursorIndex
          ? [{ text: cursorText.replace(PROMPT_GLYPH_PREFIX, ''), wrapped: false }, ...below]
          : [
              {
                text: (rowsAbove[index] ?? row).replace(PROMPT_GLYPH_PREFIX, ''),
                wrapped: false
              },
              ...rowsAbove.slice(index + 1, cursorIndex).map((text, offset) => ({
                text,
                wrapped: context.rowsWrapped?.[index + 1 + offset] ?? false
              })),
              { text: cursorText, wrapped: context.rowsWrapped?.[cursorIndex] ?? false },
              ...below
            ]
      }
      // Only Claude's composer is known to paint suggestions dim; Codex keeps its own reading.
      const separatesDim = glyph === '❯'
      const text = joinComposerLines(composerLines(separatesDim ? 'text' : 'legacy'))
      const suggestion =
        text || stockPlaceholder || !separatesDim ? '' : joinComposerLines(composerLines('raw'))
      if (!text && !stockPlaceholder && !suggestion) {
        return null
      }
      return {
        text,
        promptRow: context.cursorViewportRow - (cursorIndex - index),
        cursorRow: context.cursorViewportRow,
        endRow: context.cursorViewportRow + continuationRows.length,
        promptGlyph: glyph,
        placeholder: !text,
        stockPlaceholder: !text && stockPlaceholder,
        suggestion
      }
    }
    if (row.length > 0 && context.rowsWrapped?.[index] !== true && !/^\s/.test(row)) {
      return null
    }
  }
  return null
}

export function detectTerminalComposerDraft(
  context: TerminalCursorContext | null | undefined
): TerminalComposerDraft | null {
  const match = detectTerminalComposerPrompt(context)
  if (!match || match.placeholder) {
    return null
  }
  return {
    text: match.text,
    promptRow: match.promptRow,
    cursorRow: match.cursorRow,
    endRow: match.endRow,
    promptGlyph: match.promptGlyph
  }
}

export function hasTerminalComposerPlaceholder(
  context: TerminalCursorContext | null | undefined
): boolean {
  return detectTerminalComposerPrompt(context)?.placeholder === true
}
