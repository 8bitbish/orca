import { describe, expect, it } from 'vitest'
import {
  detectTerminalComposerDraft,
  detectTerminalComposerPrompt,
  hasTerminalComposerPlaceholder,
  readTerminalComposerTypedText
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

  it('keeps rule-prefixed draft rows inside a labelled composer with a hidden normal cursor', () => {
    expect(
      detectTerminalComposerDraft({
        rows: ['──────── ultracode ─', '❯ review the results'],
        typedRows: ['──────── ultracode ─', '❯ review the results'],
        promptGlyphBoldRows: [false, false],
        rowsBelow: ['-------- coverage --------', '────────'],
        typedRowsBelow: ['-------- coverage --------', '────────'],
        beforeCursor: '❯ review',
        afterCursor: ' the results',
        rawAfterCursor: ' the results',
        cursorViewportRow: 4,
        cursorHidden: true,
        activeBuffer: 'normal',
        cursorInverse: false
      })
    ).toMatchObject({
      text: 'review the results\n-------- coverage --------',
      promptRow: 4,
      endRow: 5
    })
  })

  it('recognizes a wrapped placeholder before checking a labelled closing frame', () => {
    const context = {
      rows: ['──────── mode label', '❯ Try “fix the'],
      typedRows: ['──────── mode label', '❯'],
      promptGlyphBoldRows: [false, false],
      rowsBelow: [' failing test”', '────────'],
      typedRowsBelow: ['', '────────'],
      rowsBelowWrapped: [true, false],
      beforeCursor: '❯ ',
      afterCursor: '',
      rawAfterCursor: 'Try “fix the',
      cursorHidden: false,
      cursorViewportRow: 4
    }

    expect(hasTerminalComposerPlaceholder(context)).toBe(true)
    expect(detectTerminalComposerDraft(context)).toBeNull()
  })

  it('keeps a typed draft whose stock placeholder is still rendered to its right', () => {
    // Repaints can leave the placeholder beside typed text; only its dim tail is masked, never the draft.
    const context = {
      rows: ['\u203a \uc548\ub155Ask Codex to do anything'],
      typedRows: ['\u203a \uc548\ub155'],
      promptGlyphBoldRows: [true],
      rowsBelow: ['', 'gpt-5.6 \u00b7 ~/repo'],
      typedRowsBelow: ['', 'gpt-5.6 \u00b7 ~/repo'],
      beforeCursor: '\u203a \uc548\ub155',
      afterCursor: '',
      rawAfterCursor: 'Ask Codex to do anything',
      cursorHidden: false,
      cursorViewportRow: 4
    }

    expect(detectTerminalComposerDraft(context)).toEqual({
      text: '\uc548\ub155',
      promptRow: 4,
      cursorRow: 4,
      endRow: 4,
      promptGlyph: '\u203a'
    })
    expect(hasTerminalComposerPlaceholder(context)).toBe(true)
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

  it('preserves an ordinary shell prompt that uses the Codex glyph', () => {
    const context = {
      rows: ['last command output', '› git status'],
      typedRows: ['last command output', '› git status'],
      promptGlyphBoldRows: [false, true],
      rowsBelow: [],
      typedRowsBelow: [],
      beforeCursor: '› git status',
      afterCursor: '',
      rawAfterCursor: '',
      cursorHidden: false,
      cursorViewportRow: 7
    }

    expect(detectTerminalComposerDraft(context)).toBeNull()
    expect(hasTerminalComposerPlaceholder(context)).toBe(false)
  })

  it('keeps typed soft-wrapped rows below a restored cursor in the draft', () => {
    expect(
      detectTerminalComposerDraft({
        rows: ['────────', '❯ proceed with the '],
        typedRows: ['────────', '❯ proceed with the '],
        promptGlyphBoldRows: [false, false],
        rowsWrapped: [false, false],
        rowsBelow: ['release'],
        typedRowsBelow: ['release'],
        rowsBelowWrapped: [true],
        beforeCursor: '❯ proceed',
        afterCursor: ' with the ',
        rawAfterCursor: ' with the ',
        cursorHidden: false,
        cursorViewportRow: 8
      })?.text
    ).toBe('proceed with the release')
  })
})

describe('readTerminalComposerTypedText', () => {
  const suggestionOnly = {
    rows: ['────────', '❯'],
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

  it("finds the closing frame past dim suggestion rows under Claude's hidden caret", () => {
    const hidden = { ...suggestionOnly, cursorHidden: true, activeBuffer: 'normal' as const }
    expect(readTerminalComposerTypedText(hidden)).toBe('')
    expect(
      readTerminalComposerTypedText({
        ...hidden,
        rows: ['────────', '❯ ship it'],
        typedRows: ['────────', '❯ ship it'],
        beforeCursor: '❯ ship it'
      })
    ).toBe('ship it')
  })

  it('keeps undimmed text even when it reads like a stock placeholder', () => {
    expect(
      readTerminalComposerTypedText({
        ...suggestionOnly,
        rows: ['────────', '❯ Try "write a migration"'],
        typedRows: ['────────', '❯ Try "write a migration"'],
        beforeCursor: '❯ ',
        afterCursor: 'Try "write a migration"',
        rawAfterCursor: 'Try "write a migration"'
      })
    ).toBe('Try "write a migration"')
  })

  it('keeps indentation the user typed on continuation lines', () => {
    expect(
      readTerminalComposerTypedText({
        ...suggestionOnly,
        rows: ['────────', '❯ def f():', '      return 1'],
        typedRows: ['────────', '❯ def f():', '      return 1'],
        promptGlyphBoldRows: [false, false, false],
        beforeCursor: '      return 1'
      })
    ).toBe('def f():\n    return 1')
  })
})
