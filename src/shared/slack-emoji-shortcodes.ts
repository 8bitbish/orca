// Slack's `:name:` emoji shortcodes as Unicode emoji, for text Slack sent us. A plain
// scanner (no lookbehind, Intl or Node APIs) so the mobile Hermes bundle runs it as is.

import { SLACK_EMOJI_ENTRIES, SLACK_EMOJI_TONE_EXCEPTIONS } from './slack-emoji-shortcodes-data'

type SlackEmoji = { emoji: string; skinnable: boolean; tones?: readonly string[] }
type SlackEmojiIndex = {
  byName: ReadonlyMap<string, SlackEmoji>
  byEmoji: ReadonlyMap<string, SlackEmoji>
  longestEmoji: number
}

const TONE_MODIFIERS = [0x1f3fb, 0x1f3fc, 0x1f3fd, 0x1f3fe, 0x1f3ff]
const TONE_PREFIX = 'skin-tone-'
const MAX_NAME_LENGTH = 64
const VARIATION_SELECTOR = '️'
const ZWJ = '‍'

function fromHex(hex: string): string {
  return String.fromCodePoint(...hex.split('-').map((point) => Number.parseInt(point, 16)))
}

let index: SlackEmojiIndex | null = null

// Lazy: most text has no shortcode, so the 2,000-name table is only built on the first one.
function loadIndex(): SlackEmojiIndex {
  if (index) {
    return index
  }
  const byName = new Map<string, SlackEmoji>()
  const byEmoji = new Map<string, SlackEmoji>()
  let longestEmoji = 0
  for (const line of SLACK_EMOJI_ENTRIES) {
    for (const entry of line.split(' ')) {
      const skinnable = entry.startsWith('~')
      const [hex, names] = entry.slice(skinnable ? 1 : 0).split('=')
      const emoji: SlackEmoji = { emoji: fromHex(hex), skinnable }
      for (const name of names.split(',')) {
        byName.set(name, emoji)
      }
      // Typed emoji often drop the variation selector, so match both spellings.
      for (const spelling of [emoji.emoji, emoji.emoji.split(VARIATION_SELECTOR).join('')]) {
        byEmoji.set(spelling, emoji)
        longestEmoji = Math.max(longestEmoji, spelling.length)
      }
    }
  }
  for (const line of SLACK_EMOJI_TONE_EXCEPTIONS) {
    for (const entry of line.split(' ')) {
      const [name, tones] = entry.split('=')
      const emoji = byName.get(name)
      if (emoji) {
        emoji.tones = tones.split('|').map(fromHex)
      }
    }
  }
  index = { byName, byEmoji, longestEmoji }
  return index
}

/** `tone` is Slack's 2–6. Unicode puts the modifier after the base, dropping its FE0F. */
function withTone(emoji: SlackEmoji, tone: number): string {
  const exception = emoji.tones?.[tone - 2]
  if (exception) {
    return exception
  }
  const [base, ...rest] = Array.from(emoji.emoji)
  const tail = rest[0] === VARIATION_SELECTOR ? rest.slice(1) : rest
  return `${base}${String.fromCodePoint(TONE_MODIFIERS[tone - 2])}${tail.join('')}`
}

function isNameChar(char: string): boolean {
  return (
    (char >= 'a' && char <= 'z') ||
    (char >= '0' && char <= '9') ||
    char === '_' ||
    char === '+' ||
    char === '-'
  )
}

function isSchemeChar(char: string | undefined): boolean {
  return (
    char !== undefined &&
    ((char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z') || (char >= '0' && char <= '9'))
  )
}

function isUrlEnd(char: string): boolean {
  return char === ' ' || char === '\n' || char === '\t' || char === '<' || char === '>'
}

/** Index just past the `:name:` starting at `at`, or -1. */
function shortcodeEnd(text: string, at: number): number {
  let cursor = at + 1
  while (cursor < text.length && cursor - at <= MAX_NAME_LENGTH && isNameChar(text[cursor])) {
    cursor += 1
  }
  return cursor > at + 1 && text[cursor] === ':' ? cursor + 1 : -1
}

/** Index just past a `` `code` `` or ```` ```block``` ```` starting at `at`, or -1. */
function codeEnd(text: string, at: number): number {
  const fence = text.startsWith('```', at) ? '```' : '`'
  const close = text.indexOf(fence, at + fence.length)
  return close === -1 ? -1 : close + fence.length
}

/** The emoji a literal skin-tone code would modify: the longest known one ending `out`. */
function trailingLiteralEmoji(
  out: string,
  emojiIndex: SlackEmojiIndex
): { emoji: SlackEmoji; length: number } | null {
  for (let length = Math.min(out.length, emojiIndex.longestEmoji); length > 0; length -= 1) {
    const emoji = emojiIndex.byEmoji.get(out.slice(out.length - length))
    if (emoji) {
      // Part of a longer ZWJ sequence that is not in the table: leave it alone.
      return out[out.length - length - 1] === ZWJ ? null : { emoji, length }
    }
  }
  return null
}

/**
 * Known shortcodes become emoji; `:skin-tone-2:` … `:skin-tone-6:` tone the emoji right
 * before them (`:wave::skin-tone-3:`, or a typed 👋). Unknown and custom workspace codes,
 * code spans and bare URLs stay exactly as written.
 */
export function replaceSlackEmojiShortcodes(text: string): string {
  if (!text.includes(':')) {
    return text
  }
  const emojiIndex = loadIndex()
  let out = ''
  // What the previous token was, for a skin tone that follows it.
  let previous: { kind: 'emoji'; emoji: SlackEmoji } | { kind: 'custom' } | null = null
  let cursor = 0
  while (cursor < text.length) {
    const char = text[cursor]
    if (char === '`') {
      const end = codeEnd(text, cursor)
      if (end !== -1) {
        out += text.slice(cursor, end)
        cursor = end
        previous = null
        continue
      }
    }
    if (char === ':' && text.startsWith('//', cursor + 1) && isSchemeChar(text[cursor - 1])) {
      let end = cursor
      while (end < text.length && !isUrlEnd(text[end])) {
        end += 1
      }
      out += text.slice(cursor, end)
      cursor = end
      previous = null
      continue
    }
    const end = char === ':' ? shortcodeEnd(text, cursor) : -1
    if (end === -1) {
      out += char
      cursor += 1
      previous = null
      continue
    }
    const code = text.slice(cursor, end)
    const name = code.slice(1, -1)
    const toneDigit = name.startsWith(TONE_PREFIX) ? name.slice(TONE_PREFIX.length) : ''
    const tone = toneDigit.length === 1 ? '23456'.indexOf(toneDigit) : -1
    const emoji = emojiIndex.byName.get(name)
    cursor = end
    if (tone !== -1 && previous?.kind === 'emoji') {
      // A tone on an emoji that takes none is dropped.
      if (previous.emoji.skinnable) {
        out =
          out.slice(0, out.length - previous.emoji.emoji.length) +
          withTone(previous.emoji, tone + 2)
      }
      previous = null
      continue
    }
    if (tone !== -1 && previous === null) {
      const literal = trailingLiteralEmoji(out, emojiIndex)
      if (literal?.emoji.skinnable) {
        out = out.slice(0, out.length - literal.length) + withTone(literal.emoji, tone + 2)
        continue
      }
    }
    if (emoji && !(tone !== -1 && previous?.kind === 'custom')) {
      out += emoji.emoji
      previous = tone === -1 ? { kind: 'emoji', emoji } : null
      continue
    }
    out += code
    previous = { kind: 'custom' }
  }
  return out
}
