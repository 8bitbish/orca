// The JSON body of a ```proof-card fence: what an agent's finished task looks like,
// as a recording, screenshots or a before/after pair, with what was checked. The
// shape is the one in ~/Assistant/specs/proof-cards.md §3.
//
// Known fields are checked strictly, and a bad one rejects the card so the fence
// shows as the raw block it is. Unknown keys are ignored: proof.json is written by
// a capture skill and may carry bundle metadata the card has no use for.
//
// A media item whose path is not in the proof folder is kept with `path: null`, so
// the card can say the file cannot be shown rather than dropping it silently.

import {
  isNativeChatCardRecord,
  parseNativeChatCardActions,
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
  /** Relative to the proof folder; null when the card named a file outside it. */
  path: string | null
  /** The path as the card wrote it, for the placeholder's label. */
  source: string
  caption?: string
  where?: string
  role?: 'before' | 'after'
}

export type NativeChatProofCheckTone = 'pass' | 'fail' | 'unchecked' | 'neutral'

export type NativeChatProofCheck = {
  label: string
  result: string
  tone: NativeChatProofCheckTone
}

export type NativeChatProofLink = { label: string; url: string }

export type NativeChatProofCard = {
  worktree: string
  title: string
  kind?: NativeChatProofKind
  summary?: string
  media: NativeChatProofMedia[]
  checks: NativeChatProofCheck[]
  links: NativeChatProofLink[]
  actions: NativeChatCardAction[]
}

const MAX_TITLE_LENGTH = 200
const MAX_SUMMARY_LENGTH = 1000
const MAX_CAPTION_LENGTH = 200
const MAX_LABEL_LENGTH = 80
const MAX_RESULT_LENGTH = 160
const MAX_URL_LENGTH = 2048
const MAX_MEDIA = 12
const MAX_CHECKS = 12
const MAX_LINKS = 8
const MAX_PATH_LENGTH = 1024
const MAX_SEGMENTS = 12
const SEGMENT = /^[^/\\\0]{1,255}$/
const ROOT_MARKER = `/${NATIVE_CHAT_PROOF_ROOT_HOME_RELATIVE.join('/')}/`
const HOME_PREFIX = `~${ROOT_MARKER}`

class InvalidCard extends Error {}

function reject(): never {
  throw new InvalidCard()
}

function absent(value: unknown): value is null | undefined {
  return value === undefined || value === null
}

function text(value: unknown, max: number): string {
  if (typeof value !== 'string' || value.length > max || value.trim() === '') {
    reject()
  }
  return value.trim()
}

function optionalText(value: unknown, max: number): string | undefined {
  return absent(value) ? undefined : text(value, max)
}

function list<T>(value: unknown, max: number, read: (entry: unknown) => T): T[] {
  if (absent(value)) {
    return []
  }
  return Array.isArray(value) && value.length <= max ? value.map(read) : reject()
}

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
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_PATH_LENGTH) {
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

function media(value: unknown): NativeChatProofMedia {
  if (!isNativeChatCardRecord(value)) {
    reject()
  }
  const type = value.type === 'video' || value.type === 'image' ? value.type : reject()
  const source = text(value.path, MAX_PATH_LENGTH)
  const caption = optionalText(value.caption, MAX_CAPTION_LENGTH)
  const where = optionalText(value.where, MAX_CAPTION_LENGTH)
  const role = absent(value.role)
    ? undefined
    : value.role === 'before' || value.role === 'after'
      ? value.role
      : reject()
  return {
    type,
    path: normalizeNativeChatProofMediaPath(source, type),
    source,
    ...(caption ? { caption } : {}),
    ...(where ? { where } : {}),
    ...(role ? { role } : {})
  }
}

function check(value: unknown): NativeChatProofCheck {
  if (!isNativeChatCardRecord(value)) {
    reject()
  }
  const result = text(value.result, MAX_RESULT_LENGTH)
  return {
    label: text(value.label, MAX_LABEL_LENGTH),
    result,
    tone: nativeChatProofCheckTone(result)
  }
}

function link(value: unknown): NativeChatProofLink {
  if (!isNativeChatCardRecord(value)) {
    reject()
  }
  const url = text(value.url, MAX_URL_LENGTH)
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    reject()
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    reject()
  }
  return { label: text(value.label, MAX_LABEL_LENGTH), url: parsed.toString() }
}

function kind(value: unknown): NativeChatProofKind | undefined {
  if (absent(value)) {
    return undefined
  }
  return NATIVE_CHAT_PROOF_KINDS.find((known) => known === value) ?? reject()
}

function readCard(value: unknown): NativeChatProofCard {
  if (!isNativeChatCardRecord(value)) {
    reject()
  }
  const cardKind = kind(value.kind)
  const summary = optionalText(value.summary, MAX_SUMMARY_LENGTH)
  const actions = parseNativeChatCardActions(absent(value.actions) ? undefined : value.actions, {
    closed: true
  })
  return {
    worktree: text(value.worktree, 512),
    title: text(value.title, MAX_TITLE_LENGTH),
    ...(cardKind ? { kind: cardKind } : {}),
    ...(summary ? { summary } : {}),
    media: list(value.media, MAX_MEDIA, media),
    checks: list(value.checks, MAX_CHECKS, check),
    links: list(value.links, MAX_LINKS, link),
    actions: actions ?? reject()
  }
}

/** Null for bad JSON or a known field outside the documented shape. */
export function parseNativeChatProofCard(source: string): NativeChatProofCard | null {
  let value: unknown
  try {
    value = JSON.parse(source)
  } catch {
    return null
  }
  try {
    return readCard(value)
  } catch (error) {
    if (error instanceof InvalidCard) {
      return null
    }
    throw error
  }
}

/** The before/after pair the card compares with a slider: exactly one of each image. */
export function nativeChatProofComparePair(
  items: readonly NativeChatProofMedia[]
): { before: NativeChatProofMedia; after: NativeChatProofMedia } | null {
  const before = items.filter((item) => item.type === 'image' && item.role === 'before')
  const after = items.filter((item) => item.type === 'image' && item.role === 'after')
  return before.length === 1 && after.length === 1 ? { before: before[0], after: after[0] } : null
}
