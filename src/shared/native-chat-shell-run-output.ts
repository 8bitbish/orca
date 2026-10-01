// What a chat Run keeps of its output, and whether that output is asking for input.

import { stripAnsiEscapeSequences } from './ansi-escape-sequences'

export const NATIVE_CHAT_SHELL_RUN_OUTPUT_MAX_LINES = 200
export const NATIVE_CHAT_SHELL_RUN_OUTPUT_MAX_BYTES = 64 * 1024
/** A bare prompt-shaped last line counts only after the run has been quiet this long. */
export const NATIVE_CHAT_SHELL_RUN_QUIET_PROMPT_MS = 1500

export type NativeChatShellRunOutput = { text: string; truncated: boolean }

export type NativeChatShellRunInputKind = 'secret' | 'confirm' | 'key' | 'prompt'

/** The last lines of `text` that fit both caps; `truncated` says whether any were dropped. */
export function truncateNativeChatShellRunOutput(
  text: string,
  maxLines = NATIVE_CHAT_SHELL_RUN_OUTPUT_MAX_LINES,
  maxBytes = NATIVE_CHAT_SHELL_RUN_OUTPUT_MAX_BYTES
): NativeChatShellRunOutput {
  const lines = text.split('\n')
  let truncated = lines.length > maxLines
  let kept = truncated ? lines.slice(lines.length - maxLines) : lines
  const encoder = new TextEncoder()
  let bytes = encoder.encode(kept.join('\n')).length
  while (bytes > maxBytes && kept.length > 1) {
    bytes -= encoder.encode(kept[0]).length + 1
    kept = kept.slice(1)
    truncated = true
  }
  let result = kept.join('\n')
  if (bytes > maxBytes) {
    // One line longer than the whole budget: keep its end, which is what was printed last.
    result = result.slice(result.length - Math.floor(maxBytes / 4))
    truncated = true
  }
  return { text: result, truncated }
}

const SECRET = /\b(password|passphrase|passcode|pin|otp|token|secret)\b[^\n]*[:?]\s*$/i
const CONFIRM =
  /(\[(y\/n|y\/N|Y\/n|yes\/no)\]|\((y\/n|yes\/no)\)|\by\/n\b|\b(are you sure|continue|proceed|overwrite)\b[^\n]*\?)\s*:?\s*$/i
const KEY = /\b(press (any key|enter|return)|hit (enter|return))\b/i
const PROMPT_END = /[:?>]\s*$/

/**
 * Whether the run's last line reads as a prompt waiting on the keyboard. Prompt words
 * count at once; any other line ending in `:`, `?` or `>` only once the run has gone
 * quiet, since Orca cannot see whether the process is blocked reading stdin.
 */
export function detectNativeChatShellRunInputPrompt(
  output: string,
  quietForMs: number
): NativeChatShellRunInputKind | null {
  const lastLine = stripAnsiEscapeSequences(output.split('\n').at(-1) ?? '')
  if (lastLine.trim() === '') {
    return null
  }
  if (SECRET.test(lastLine)) {
    return 'secret'
  }
  if (CONFIRM.test(lastLine)) {
    return 'confirm'
  }
  if (KEY.test(lastLine)) {
    return 'key'
  }
  return quietForMs >= NATIVE_CHAT_SHELL_RUN_QUIET_PROMPT_MS && PROMPT_END.test(lastLine)
    ? 'prompt'
    : null
}
