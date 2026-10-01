import {
  detectTerminalComposerPrompt,
  type TerminalComposerPrompt
} from '../../shared/terminal-composer-draft'
import type { HeadlessEmulator } from '../daemon/headless-emulator'
import type { RuntimeTerminalProjection } from './orca-runtime-core'
import { visibleNonBlankTerminalLines } from './terminal-tail-read'

/** The prompt box the projection masks out of the screen: typed or holding a dim suggestion.
 *  A stock placeholder stays in place, as it always has. */
function maskedComposerPrompt(emulator: HeadlessEmulator): TerminalComposerPrompt | null {
  const prompt = detectTerminalComposerPrompt(emulator.getCursorLineContext())
  return prompt && !prompt.stockPlaceholder ? prompt : null
}

function maskComposerRows(visible: string[], prompt: TerminalComposerPrompt): void {
  visible[prompt.promptRow] = prompt.promptGlyph
  for (let row = prompt.promptRow + 1; row <= prompt.endRow; row += 1) {
    visible[row] = ''
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
  emulator: HeadlessEmulator,
  limit: number
): RuntimeTerminalProjection {
  const tail = emulator.getBufferTailLines(limit)
  const visible = emulator.getVisibleLines()
  const visibleRange = emulator.getVisibleBufferRange()
  const prompt = maskedComposerPrompt(emulator)
  if (prompt && visibleRange.endExclusive === visibleRange.totalLength) {
    maskComposerRows(visible, prompt)
    const scrollbackTail = tail.slice(0, Math.max(0, tail.length - visible.length))
    tail.splice(0, tail.length, ...scrollbackTail, ...visibleNonBlankTerminalLines(visible))
  }
  return {
    lines: visibleNonBlankTerminalLines(tail).slice(-limit),
    ...composerFields(prompt)
  }
}

export function projectTerminalVisibleLines(emulator: HeadlessEmulator): RuntimeTerminalProjection {
  const visible = emulator.getVisibleLines()
  const prompt = maskedComposerPrompt(emulator)
  if (prompt) {
    maskComposerRows(visible, prompt)
  }
  return {
    lines: visibleNonBlankTerminalLines(visible),
    ...composerFields(prompt)
  }
}
