import { describe, expect, it } from 'vitest'
import { formatTerminalRead } from './terminal-format'

describe('formatTerminalRead', () => {
  it('labels an agent suggestion apart from a typed draft', () => {
    const output = formatTerminalRead({
      terminal: {
        handle: 'term_1',
        status: 'running',
        tail: ['Build passed', '❯'],
        truncated: false,
        nextCursor: null,
        source: 'screen',
        suggestion: 'now write the full README'
      }
    })
    expect(output).toContain('suggestion: "now write the full README"')
    expect(output).not.toContain('draft:')
  })
})
