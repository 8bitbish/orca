import { isStockPlaceholder } from './terminal-composer-stock-placeholder'
import { joinComposerLines } from './terminal-composer-lines'

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
  /** Read only while the native cursor is hidden; absent means unknown. */
  activeBuffer?: 'normal' | 'alternate'
  cursorInverse?: boolean
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

const COMPOSER_PROMPT_PREFIX = /^\s*[\u276F\u203A\u00BB]\s?/
const COMPOSER_FRAME_LINE = /^[\u2500\u2501-]{8,}\s*$/
const COMPOSER_TOP_FRAME_PREFIX = /^[\u2500\u2501-]{8,}/
const CODEX_FOOTER_LINE = /^\s*(?:gpt-\S+|o\d\S*)\s+[\u00B7\u2022]\s+\S.*$/i

function composerContinuationRows(
  context: TerminalCursorContext,
  afterCursor: string,
  codexFooterIndex: number,
  typedOnly: boolean
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
    const typed = context.typedRowsBelow[index] ?? ''
    if (!(typedOnly ? typed : raw).trim() && !hasTypedContinuationAfter[index]) {
      break
    }
    // A dim-only row still belongs to the prompt box (it extends `endRow`), but none of it was typed.
    continuation.push({
      text: typed,
      raw,
      legacy: typed.trim() || typedOnly ? typed : raw,
      wrapped: context.rowsBelowWrapped?.[index] ?? false
    })
  }
  return continuation
}

function hasFooterGap(context: TerminalCursorContext, index: number): boolean {
  return index > 0 && !(context.rowsBelow[index - 1] ?? '').trim()
}

function isCodexFooterRow(context: TerminalCursorContext, index: number): boolean {
  const row = context.rowsBelow[index] ?? ''
  const undimmed = context.typedRowsBelow[index] ?? ''
  const gap = hasFooterGap(context, index)
  const isDimmedFooter = gap && !undimmed.trim() && context.rowsBelowWrapped?.[index] === false
  const isColoredFooter =
    gap &&
    context.rowsBelowCustomForeground?.[index] === true &&
    context.rowsBelowWrapped?.[index] === false
  return isDimmedFooter || isColoredFooter || CODEX_FOOTER_LINE.test(row)
}

function findCodexFooterIndex(context: TerminalCursorContext): number {
  const last = context.rowsBelow.findLastIndex((row) => row.trim())
  if (last === -1 || isCodexFooterRow(context, last)) {
    return last
  }
  // Why: Codex's separate status line keeps its hint row (`? for shortcuts`) directly below it.
  const status = last - 1
  if (
    COMPOSER_FRAME_LINE.test(context.rowsBelow[last] ?? '') ||
    !(context.rowsBelow[status] ?? '').trim() ||
    !hasFooterGap(context, status)
  ) {
    return -1
  }
  return isCodexFooterRow(context, status) ? status : -1
}

// Why: Claude's default caret hides the native cursor and parks it at a painted caret cell. That paint
// drops on focus-out, so it is required only where another program's alternate-screen frame could
// mimic the box; a complete frame with the cursor inside is always required.
function isHiddenComposerCaret(
  context: TerminalCursorContext,
  cursorOnPromptRow: boolean,
  closedByFrame: boolean
): boolean {
  return (
    closedByFrame &&
    (!cursorOnPromptRow || /^\s*❯/.test(context.beforeCursor)) &&
    (context.activeBuffer === 'normal' || context.cursorInverse === true)
  )
}

// Why: Claude paints its caret over a suggestion's first glyph undimmed and dims the rest (#40195).
function isCaretOverDimSuggestion(context: TerminalCursorContext): boolean {
  const painted = context.afterCursor
  const raw = context.rawAfterCursor
  return (
    context.cursorInverse === true &&
    [...painted].length === 1 &&
    raw.length > painted.length &&
    raw.startsWith(painted) &&
    // Why: on a typed word's last glyph the caret sits before a dim hint and the glyph is real.
    (!context.beforeCursor.replace(COMPOSER_PROMPT_PREFIX, '').trim() ||
      !/\s/.test(raw[painted.length] ?? ''))
  )
}

/** The prompt box at the cursor, if one is on screen. `text` holds only what was typed. */
export function detectTerminalComposerPrompt(
  context: TerminalCursorContext | null | undefined,
  typedOnly = false
): TerminalComposerPrompt | null {
  if (!context || context.rows.length === 0) {
    return null
  }
  const cursorIndex = context.rows.length - 1
  const codexFooterIndex = findCodexFooterIndex(context)
  const typedAfter = isCaretOverDimSuggestion(context) ? '' : context.afterCursor
  let rawAfterCursor = typedOnly ? typedAfter : typedAfter || context.rawAfterCursor
  let afterCursor = typedAfter
  let continuationRows = composerContinuationRows(
    context,
    rawAfterCursor,
    codexFooterIndex,
    typedOnly
  )
  // Why: the continuation walk stops at the row that would close the frame; typed-only walks also
  // stop at dim suggestion rows, which still sit inside the frame.
  let frameIndex = continuationRows.length
  while (
    typedOnly &&
    (context.rowsBelow[frameIndex] ?? '').trim() &&
    !(context.typedRowsBelow[frameIndex] ?? '').trim() &&
    !COMPOSER_FRAME_LINE.test(context.rowsBelow[frameIndex] ?? '')
  ) {
    frameIndex += 1
  }
  const closedByFrame = COMPOSER_FRAME_LINE.test(context.rowsBelow[frameIndex] ?? '')
  // Typed-only reads already drop dim placeholders; undimmed text that matches one is the user's.
  const stockPlaceholder = !typedOnly && isStockPlaceholder(rawAfterCursor, continuationRows)
  if (stockPlaceholder) {
    rawAfterCursor = ''
    afterCursor = ''
    continuationRows = []
  }
  for (let index = cursorIndex; index >= 0; index -= 1) {
    const row = context.rows[index] ?? ''
    const matched = row.match(/^\s*([❯›»])/)?.[1]
    const glyph = (['❯', '›', '»'] as const).find((candidate) => candidate === matched)
    if (glyph) {
      if (glyph === '❯') {
        const top = context.rows[index - 1] ?? ''
        if (
          (!COMPOSER_FRAME_LINE.test(top) &&
            (!COMPOSER_TOP_FRAME_PREFIX.test(top.trimStart()) || !closedByFrame)) ||
          (context.cursorHidden &&
            !isHiddenComposerCaret(context, index === cursorIndex, closedByFrame))
        ) {
          return null
        }
      } else if (
        context.cursorHidden ||
        context.promptGlyphBoldRows[index] !== true ||
        codexFooterIndex === -1
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
          ? [{ text: cursorText.replace(COMPOSER_PROMPT_PREFIX, ''), wrapped: false }, ...below]
          : [
              {
                text: (rowsAbove[index] ?? row).replace(COMPOSER_PROMPT_PREFIX, ''),
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
      // The agent pads continuation rows to the width of its prompt; deeper indentation is the user's.
      const layoutPadding = typedOnly ? (row.match(COMPOSER_PROMPT_PREFIX)?.[0].length ?? 0) : null
      // Only Claude's composer is known to paint suggestions dim; Codex keeps its own reading.
      const separatesDim = glyph === '❯'
      const text = joinComposerLines(composerLines(separatesDim ? 'text' : 'legacy'), layoutPadding)
      const suggestion =
        text || stockPlaceholder || !separatesDim || typedOnly
          ? ''
          : joinComposerLines(composerLines('raw'), null)
      if (!text && !stockPlaceholder && !suggestion && !typedOnly) {
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

// Why: dsh-tui 0.17 boxes its single-line launchpad composer (`│ ❯ draft │`) under a `╭─╮` top.
// Why String.raw: the orcad bundle must stay ASCII, and the formatter unescapes regex literals.
const BOXED_COMPOSER_TOP = new RegExp(String.raw`^\s*\u256D\u2500{8,}\u256E\s*$`)
const BOXED_COMPOSER_ROW = new RegExp(String.raw`^\s*\u2502 \u276F `)
const BOXED_COMPOSER_RIGHT_EDGE = new RegExp(String.raw`\u2502\s*$`)

function detectBoxedComposerDraft(context: TerminalCursorContext): TerminalComposerDraft | null {
  const cursorIndex = context.rows.length - 1
  if (
    context.cursorHidden ||
    !BOXED_COMPOSER_ROW.test(context.rows[cursorIndex] ?? '') ||
    !BOXED_COMPOSER_TOP.test(context.rows[cursorIndex - 1] ?? '')
  ) {
    return null
  }
  // Why left of the cursor: the empty launchpad paints its placeholder, undimmed, right of it.
  const typed = context.beforeCursor.replace(BOXED_COMPOSER_ROW, '')
  if (!typed.trim()) {
    return null
  }
  const text = `${typed}${context.afterCursor.replace(BOXED_COMPOSER_RIGHT_EDGE, '')}`.trim()
  const row = context.cursorViewportRow
  return { text, promptRow: row, cursorRow: row, endRow: row, promptGlyph: '❯' }
}

export function detectTerminalComposerDraft(
  context: TerminalCursorContext | null | undefined
): TerminalComposerDraft | null {
  const boxed = context ? detectBoxedComposerDraft(context) : null
  if (boxed) {
    return boxed
  }
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

/** The user's own text in the composer, '' when it holds only a placeholder or a dim suggestion, null when no composer is visible. */
export function readTerminalComposerTypedText(
  context: TerminalCursorContext | null | undefined
): string | null {
  const boxed = context ? detectBoxedComposerDraft(context) : null
  return boxed ? boxed.text : (detectTerminalComposerPrompt(context, true)?.text ?? null)
}

export function hasTerminalComposerPlaceholder(
  context: TerminalCursorContext | null | undefined
): boolean {
  return detectTerminalComposerPrompt(context)?.placeholder === true
}
