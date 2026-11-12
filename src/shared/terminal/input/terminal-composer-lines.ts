/** Joins composer rows into one draft; `layoutPadding` strips the agent's continuation indent. */
export function joinComposerLines(
  lines: { text: string; wrapped: boolean }[],
  layoutPadding: number | null
): string {
  return lines
    .map((line, lineIndex) => {
      const continuesPrevious = lineIndex > 0 && line.wrapped
      const continuesNext = lines[lineIndex + 1]?.wrapped ?? false
      const start = continuesPrevious ? '' : lineIndex > 0 ? '\n' : ''
      const content = continuesPrevious
        ? line.text
        : layoutPadding !== null && lineIndex > 0
          ? line.text.slice(Math.min(layoutPadding, line.text.search(/\S|$/)))
          : line.text.trimStart()
      return `${start}${continuesNext ? content : content.trimEnd()}`
    })
    .join('')
    .trim()
}
