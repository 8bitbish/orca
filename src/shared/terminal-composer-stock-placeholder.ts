/** Placeholder text an agent paints into an empty composer, which is never the user's draft. */
// Codex before 0.152 rotated these (codex-rs/tui/src/chatwidget.rs PLACEHOLDERS, SIDE_PLACEHOLDERS).
const STOCK_PLACEHOLDERS: ReadonlySet<string> = new Set([
  'Ask Codex to do anything',
  'Ask a follow-up question',
  'Explain this codebase',
  'Summarize recent commits',
  'Implement {feature}',
  'Find and fix a bug in @filename',
  'Write tests for @filename',
  'Improve documentation in @filename',
  'Run /review on my current changes',
  'Use /skills to list available skills',
  'Check recently modified functions for compatibility',
  'How many files have been modified?',
  'Will this algorithm scale well?'
])

export function isStockPlaceholder(
  afterCursor: string,
  continuationRows: readonly { raw: string }[]
): boolean {
  const text = [afterCursor, ...continuationRows.map((row) => row.raw)]
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
  return /^Try\s+["\u201C]/.test(text) || STOCK_PLACEHOLDERS.has(text)
}
