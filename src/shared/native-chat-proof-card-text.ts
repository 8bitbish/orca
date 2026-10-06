// Display text on a proof card is cut to fit rather than refused: an agent writing a
// long check result should still get a card, not a raw JSON block.

export const NATIVE_CHAT_PROOF_ELLIPSIS = '…'

const ZERO_WIDTH_JOINER = '\u200d'

/**
 * `text` cut so its UTF-16 length is at most `max`, ending in an ellipsis. The cut
 * falls between code points, so an emoji's surrogate pair is never split.
 */
export function truncateNativeChatProofText(text: string, max: number): string {
  if (text.length <= max) {
    return text
  }
  const budget = max - NATIVE_CHAT_PROOF_ELLIPSIS.length
  let end = 0
  for (const codePoint of text) {
    if (end + codePoint.length > budget) {
      break
    }
    end += codePoint.length
  }
  let kept = text.slice(0, end).trimEnd()
  // A trailing joiner would glue the ellipsis onto half an emoji sequence.
  while (kept.endsWith(ZERO_WIDTH_JOINER)) {
    kept = kept.slice(0, -ZERO_WIDTH_JOINER.length).trimEnd()
  }
  return `${kept}${NATIVE_CHAT_PROOF_ELLIPSIS}`
}

/** One field read off the card: the text to show, and the full text when it was cut. */
export type NativeChatProofFittedText = { text: string; full?: string }

/** Trimmed, cut to `max`; undefined when not a string or blank. */
export function fitNativeChatProofText(
  value: unknown,
  max: number
): NativeChatProofFittedText | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  const full = value.trim()
  if (full === '') {
    return undefined
  }
  const text = truncateNativeChatProofText(full, max)
  return text === full ? { text } : { text, full }
}
