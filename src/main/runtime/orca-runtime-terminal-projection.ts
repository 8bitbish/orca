import {
  detectTerminalComposerPrompt,
  type TerminalComposerPrompt
} from '../../shared/terminal-composer-draft'
import type { HeadlessEmulator } from '../daemon/headless-emulator'
import type { RuntimeTerminalProjection } from './orca-runtime-core'
import type { HeadlessTerminalRow } from '../daemon/headless-terminal-rows'
import type { RuntimeTerminalRowMetadata } from '../../shared/runtime-terminal-contracts'

type ProjectedTerminalRows = RuntimeTerminalProjection & { tailRows: RuntimeTerminalRowMetadata[] }

type TerminalProjectionEmulator = Pick<
  HeadlessEmulator,
  'getBufferTailRows' | 'getVisibleRows' | 'getVisibleBufferRange' | 'getCursorLineContext'
>

function projectTerminalRows(
  rows: HeadlessTerminalRow[],
  limit = rows.length
): {
  lines: string[]
  tailRows: RuntimeTerminalRowMetadata[]
} {
  const projected: HeadlessTerminalRow[] = []
  let previous = -2
  rows.forEach((row, index) => {
    if (!row.text.trim()) {
      return
    }
    projected.push({
      text: row.text.trimEnd(),
      metadata: {
        ...row.metadata,
        trailingSpaces: row.metadata.trailingSpaces + row.text.length - row.text.trimEnd().length,
        wrapped: index === previous + 1 && row.metadata.wrapped
      }
    })
    previous = index
  })
  const kept = projected.slice(-limit)
  return {
    lines: kept.map((row) => row.text),
    tailRows: kept.map((row, index) => ({
      ...row.metadata,
      wrapped: index > 0 && row.metadata.wrapped
    }))
  }
}

/** The prompt box the projection masks out of the screen: typed or holding a dim suggestion.
 *  A stock placeholder stays in place, as it always has. */
function maskedComposerPrompt(emulator: TerminalProjectionEmulator): TerminalComposerPrompt | null {
  const prompt = detectTerminalComposerPrompt(emulator.getCursorLineContext())
  return prompt && !prompt.stockPlaceholder ? prompt : null
}

function maskComposerRows(visible: HeadlessTerminalRow[], prompt: TerminalComposerPrompt): void {
  visible[prompt.promptRow] = {
    text: prompt.promptGlyph,
    metadata: { wrapped: false, trailingSpaces: 0 }
  }
  for (let row = prompt.promptRow + 1; row <= prompt.endRow; row += 1) {
    visible[row] = { text: '', metadata: { wrapped: false, trailingSpaces: 0 } }
  }
}

/** `draft` is only what was typed; a dim suggestion Claude paints into an empty prompt is
 *  reported as `suggestion`, and neither one reaches `lines`. */
function composerFields(
  prompt: TerminalComposerPrompt | null
): Pick<RuntimeTerminalProjection, 'draft' | 'suggestion'> {
  if (!prompt) {
    return {}
  }
  return prompt.placeholder ? { suggestion: prompt.suggestion } : { draft: prompt.text }
}

export function projectTerminalTailLines(
  emulator: TerminalProjectionEmulator,
  limit: number
): ProjectedTerminalRows {
  const tail = emulator.getBufferTailRows(limit)
  const visible = emulator.getVisibleRows()
  const visibleRange = emulator.getVisibleBufferRange()
  const prompt = maskedComposerPrompt(emulator)
  if (prompt && visibleRange.endExclusive === visibleRange.totalLength) {
    maskComposerRows(visible, prompt)
    const scrollbackTail = tail.slice(0, Math.max(0, tail.length - visible.length))
    tail.splice(0, tail.length, ...scrollbackTail, ...visible)
  }
  return {
    ...projectTerminalRows(tail, limit),
    ...composerFields(prompt)
  }
}

export function projectTerminalVisibleLines(
  emulator: TerminalProjectionEmulator
): ProjectedTerminalRows {
  const visible = emulator.getVisibleRows()
  const prompt = maskedComposerPrompt(emulator)
  if (prompt) {
    maskComposerRows(visible, prompt)
  }
  return {
    ...projectTerminalRows(visible),
    ...composerFields(prompt)
  }
}

const PROJECTED_PROMPT_GLYPHS: ReadonlySet<string> = new Set(['❯', '›', '»'])

/** Undoes the projection's draft blanking, for rules that read the rows the TUI painted. */
export function restoreProjectedComposerDraft(
  lines: readonly string[],
  draft: string | undefined
): string[] {
  const promptRow = draft ? lines.findLastIndex((line) => PROJECTED_PROMPT_GLYPHS.has(line)) : -1
  if (draft === undefined || promptRow === -1) {
    return [...lines]
  }
  const [first = '', ...rest] = draft.split('\n')
  return [
    ...lines.slice(0, promptRow),
    `${lines[promptRow]} ${first}`,
    ...rest,
    ...lines.slice(promptRow + 1)
  ]
}
