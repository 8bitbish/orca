// The JSON body of a ```proof-card fence: what an agent's finished task looks like,
// as a recording, screenshots or a before/after pair, with what was checked. The
// shape is the one in ~/Assistant/specs/proof-cards.md §3.
//
// The card is read leniently so a small slip still shows a card: display text over
// its limit is cut with an ellipsis, a section past its maximum keeps its first items,
// and an item that is invalid on its own (a check with no label, a link with a bad
// URL, an action whose reply is too long) is left out. Everything adjusted is listed
// in `adjustments` so the card can say so. The reading is in
// native-chat-proof-card-reader.ts.

import {
  NATIVE_CHAT_CARD_MAX_ACTION_LABEL_LENGTH,
  NATIVE_CHAT_CARD_MAX_ACTION_REPLY_LENGTH,
  NATIVE_CHAT_CARD_MAX_ACTIONS,
  type NativeChatCardAction
} from './native-chat-card-actions'

export const NATIVE_CHAT_PROOF_CARD_FENCE = 'proof-card'

/** The proof folder under the host user's home directory. */
export const NATIVE_CHAT_PROOF_ROOT_HOME_RELATIVE = ['.orca-personal', 'proof']

export const NATIVE_CHAT_PROOF_IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp']
export const NATIVE_CHAT_PROOF_VIDEO_EXTENSIONS = ['mp4', 'm4v', 'mov', 'webm']

export const NATIVE_CHAT_PROOF_KINDS = [
  'web',
  'ios',
  'android',
  'desktop',
  'figma',
  'code'
] as const

export type NativeChatProofKind = (typeof NATIVE_CHAT_PROOF_KINDS)[number]

export type NativeChatProofMediaType = 'video' | 'image'

export type NativeChatProofMedia = {
  type: NativeChatProofMediaType
  /** Relative to the proof folder. */
  path: string
  /** The path as the card wrote it, for labels. */
  source: string
  caption?: string
  where?: string
  role?: 'before' | 'after'
  /** The full text of a field that was cut to fit. */
  full?: { caption?: string; where?: string }
}

export type NativeChatProofCheckTone = 'pass' | 'fail' | 'unchecked' | 'neutral'

export type NativeChatProofCheck = {
  label: string
  result: string
  /** Read from the full result, not the cut one. */
  tone: NativeChatProofCheckTone
  full?: { label?: string; result?: string }
}

export type NativeChatProofLink = { label: string; url: string; full?: { label?: string } }

export type NativeChatProofSection = 'media' | 'checks' | 'links' | 'actions'

export type NativeChatProofDropReason =
  /** Past the section's maximum. */
  | 'over-max'
  /** Not an object, or a required field is missing or blank. */
  | 'missing-field'
  /** A media type other than video or image. */
  | 'unknown-type'
  /** Not an http(s) URL, or too long to be one; a URL is never cut. */
  | 'invalid-url'
  /** The reply is what gets sent, so it is never cut. */
  | 'reply-too-long'
  /** Any other way an action is outside the shape, such as an unknown key. */
  | 'invalid-action'

/** What reading the card changed, for notes on the card and for a validator. */
export type NativeChatProofCardAdjustments = {
  /** Fields cut to their limit, by their place in the card as written: `checks[0].result`. */
  truncatedFields: string[]
  /** Items left out of each section, for its "+N more" note. */
  droppedCounts: Record<NativeChatProofSection, number>
  /** Each item left out, by its place in the card as written, and why. */
  dropped: { field: string; reason: NativeChatProofDropReason }[]
  /** Optional values not understood and so left off: an unknown `kind`, a `role`. */
  ignoredFields: string[]
}

export type NativeChatProofCard = {
  worktree: string
  title: string
  kind?: NativeChatProofKind
  summary?: string
  media: NativeChatProofMedia[]
  checks: NativeChatProofCheck[]
  links: NativeChatProofLink[]
  actions: NativeChatCardAction[]
  full?: { title?: string; summary?: string }
  adjustments: NativeChatProofCardAdjustments
}

/** Each field's limit, in UTF-16 units for text and items for lists. */
export const NATIVE_CHAT_PROOF_CARD_LIMITS = {
  worktree: 512,
  title: 200,
  summary: 1000,
  caption: 200,
  where: 200,
  label: 80,
  result: 160,
  url: 2048,
  path: 1024,
  actionLabel: NATIVE_CHAT_CARD_MAX_ACTION_LABEL_LENGTH,
  actionReply: NATIVE_CHAT_CARD_MAX_ACTION_REPLY_LENGTH,
  media: 12,
  checks: 12,
  links: 8,
  actions: NATIVE_CHAT_CARD_MAX_ACTIONS
} as const

const LIMITS = NATIVE_CHAT_PROOF_CARD_LIMITS
const MAX_SEGMENTS = 12
const SEGMENT = /^[^/\\\0]{1,255}$/
const ROOT_MARKER = `/${NATIVE_CHAT_PROOF_ROOT_HOME_RELATIVE.join('/')}/`
const HOME_PREFIX = `~${ROOT_MARKER}`

function extensionOf(path: string): string {
  const dot = path.lastIndexOf('.')
  return dot === -1 ? '' : path.slice(dot + 1).toLowerCase()
}

export function nativeChatProofExtensions(type: NativeChatProofMediaType): readonly string[] {
  return type === 'video' ? NATIVE_CHAT_PROOF_VIDEO_EXTENSIONS : NATIVE_CHAT_PROOF_IMAGE_EXTENSIONS
}

export function hasNativeChatProofExtension(path: string, type: NativeChatProofMediaType): boolean {
  return nativeChatProofExtensions(type).includes(extensionOf(path))
}

/**
 * The proof-folder-relative path a card's `path` names, or null when it is not one.
 * An absolute path counts only when it visibly sits in `~/.orca-personal/proof/`; it
 * is cut down to the relative part, so only that travels to the host, which still
 * resolves it with realpath and refuses anything that lands outside the folder.
 */
export function normalizeNativeChatProofMediaPath(
  value: unknown,
  type: NativeChatProofMediaType
): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > LIMITS.path) {
    return null
  }
  let relative = value
  if (value.startsWith(HOME_PREFIX)) {
    relative = value.slice(HOME_PREFIX.length)
  } else if (value.startsWith('/')) {
    const at = value.indexOf(ROOT_MARKER)
    if (at === -1) {
      return null
    }
    relative = value.slice(at + ROOT_MARKER.length)
  }
  const segments = relative.split('/')
  if (
    segments.length > MAX_SEGMENTS ||
    segments.some((segment) => !SEGMENT.test(segment) || segment === '.' || segment === '..') ||
    !hasNativeChatProofExtension(relative, type)
  ) {
    return null
  }
  return relative
}

const FAIL = /\b(fail(s|ed|ing|ure)?|error(s)?|broken|crash(es|ed)?|regress(ed|ion)?)\b|[✗✕✘❌]/i
const UNCHECKED =
  /\b(not (yet )?(checked|tested|run|verified|captured)|unchecked|untested|unverified|skipped|pending|n\/a|todo|unknown)\b|[—–]$/i
const PASS = /\b(pass(es|ed)?|ok|yes|done|verified|works|working|clean|green)\b|[✓✔✅]/i
const FRACTION = /(\d+)\s*\/\s*(\d+)/

/** How a check's result reads: a pass, a failure, something not checked, or neither. */
export function nativeChatProofCheckTone(result: string): NativeChatProofCheckTone {
  const fraction = FRACTION.exec(result)
  if (FAIL.test(result) && !/\b0 fail/i.test(result)) {
    return 'fail'
  }
  if (UNCHECKED.test(result)) {
    return 'unchecked'
  }
  if (fraction) {
    return Number(fraction[1]) >= Number(fraction[2]) ? 'pass' : 'fail'
  }
  return PASS.test(result) ? 'pass' : 'neutral'
}

/** The before/after pair the card compares with a slider: exactly one of each image. */
export function nativeChatProofComparePair(
  items: readonly NativeChatProofMedia[]
): { before: NativeChatProofMedia; after: NativeChatProofMedia } | null {
  const before = items.filter((item) => item.type === 'image' && item.role === 'before')
  const after = items.filter((item) => item.type === 'image' && item.role === 'after')
  return before.length === 1 && after.length === 1 ? { before: before[0], after: after[0] } : null
}
