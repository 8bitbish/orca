import { describe, expect, it } from 'vitest'
import {
  detectTerminalComposerDraft,
  detectTerminalComposerPrompt,
  hasTerminalComposerPlaceholder
} from './terminal-composer-draft'

// Deliberately reverses upstream (419e3b4496), which reported Claude Code's dim prompt suggestion
// as the draft. Claude Code 2.1.286 paints that suggestion in SGR 2 on the default foreground; it
// is the agent's guess, not anything the user typed, so it is a placeholder with a `suggestion`.
describe('detectTerminalComposerDraft', () => {
  it('reports a dim suggestion at an empty Claude prompt as a placeholder, not a draft', () => {
    const context = {
      rows: ['────────', '❯ proceed with the release'],
      typedRows: ['────────', '❯'],
      promptGlyphBoldRows: [false, false],
      rowsBelow: [],
      typedRowsBelow: [],
      beforeCursor: '❯ ',
      afterCursor: '',
      rawAfterCursor: 'proceed with the release',
      cursorHidden: false,
      cursorViewportRow: 8
    }

    expect(detectTerminalComposerDraft(context)).toBeNull()
    expect(hasTerminalComposerPlaceholder(context)).toBe(true)
    expect(detectTerminalComposerPrompt(context)).toEqual({
      text: '',
      promptRow: 8,
      cursorRow: 8,
      endRow: 8,
      promptGlyph: '❯',
      placeholder: true,
      stockPlaceholder: false,
      suggestion: 'proceed with the release'
    })
  })

  it('keeps typed text and drops the dim completion painted after it', () => {
    const context = {
      rows: ['────────', '❯ /compact'],
      typedRows: ['────────', '❯ /comp'],
      promptGlyphBoldRows: [false, false],
      rowsBelow: [],
      typedRowsBelow: [],
      beforeCursor: '❯ /comp',
      afterCursor: '',
      rawAfterCursor: 'act',
      cursorHidden: false,
      cursorViewportRow: 8
    }

    expect(detectTerminalComposerDraft(context)).toMatchObject({ text: '/comp', endRow: 8 })
    expect(detectTerminalComposerPrompt(context)?.suggestion).toBe('')
  })

  it("keeps Codex's reading of dim text at its composer", () => {
    const context = {
      rows: ['› Background task'],
      typedRows: ['›'],
      promptGlyphBoldRows: [true],
      rowsBelow: ['', 'gpt-5.6 · ~/repo'],
      typedRowsBelow: ['', 'gpt-5.6 · ~/repo'],
      beforeCursor: '› ',
      afterCursor: '',
      rawAfterCursor: 'Background task',
      cursorHidden: false,
      cursorViewportRow: 4
    }

    expect(detectTerminalComposerDraft(context)?.text).toBe('Background task')
    expect(hasTerminalComposerPlaceholder(context)).toBe(false)
  })

  it('keeps dimmed suggestion rows below the restored cursor inside the prompt box', () => {
    const context = {
      rows: ['────────', '❯ proceed with the release'],
      typedRows: ['────────', '❯'],
      promptGlyphBoldRows: [false, false],
      rowsBelow: ['  and close the pull request', '────────'],
      typedRowsBelow: ['', '────────'],
      beforeCursor: '❯ ',
      afterCursor: '',
      rawAfterCursor: 'proceed with the release',
      cursorHidden: false,
      cursorViewportRow: 8
    }

    expect(detectTerminalComposerDraft(context)).toBeNull()
    expect(detectTerminalComposerPrompt(context)).toMatchObject({
      text: '',
      endRow: 9,
      suggestion: 'proceed with the release\nand close the pull request'
    })
  })
})
