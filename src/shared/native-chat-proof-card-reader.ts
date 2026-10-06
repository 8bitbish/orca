// Reads a ```proof-card fence leniently (see native-chat-proof-card-payload.ts). Only
// bad JSON, the wrong top-level shape or an unsafe media path refuse the whole card;
// a URL, an action's reply and a media path are never cut, because cutting them
// would change what they point at or send.

import {
  isNativeChatCardRecord,
  parseNativeChatCardAction,
  type NativeChatCardAction
} from './native-chat-card-actions'
import {
  NATIVE_CHAT_PROOF_CARD_LIMITS as LIMITS,
  NATIVE_CHAT_PROOF_KINDS,
  nativeChatProofCheckTone,
  normalizeNativeChatProofMediaPath,
  type NativeChatProofCard,
  type NativeChatProofCardAdjustments,
  type NativeChatProofCheck,
  type NativeChatProofDropReason,
  type NativeChatProofLink,
  type NativeChatProofMedia,
  type NativeChatProofSection
} from './native-chat-proof-card-payload'
import { fitNativeChatProofText, truncateNativeChatProofText } from './native-chat-proof-card-text'

class InvalidCard extends Error {}

function reject(): never {
  throw new InvalidCard()
}

function absent(value: unknown): value is null | undefined {
  return value === undefined || value === null
}

/** Fields cut while reading one item; kept only if the item is. */
type Cuts = string[]

function fit(value: unknown, max: number, field: string, cuts: Cuts) {
  const fitted = fitNativeChatProofText(value, max)
  if (fitted?.full !== undefined) {
    cuts.push(field)
  }
  return fitted
}

/** An optional text field: left off, and noted, when it is there but not text. */
function optionalFit(value: unknown, max: number, field: string, cuts: Cuts, ignored: string[]) {
  if (!absent(value) && typeof value !== 'string') {
    ignored.push(field)
  }
  return fit(value, max, field, cuts)
}

function readMedia(
  entry: unknown,
  field: string,
  cuts: Cuts,
  ignored: string[]
): NativeChatProofMedia | NativeChatProofDropReason {
  if (!isNativeChatCardRecord(entry)) {
    return 'missing-field'
  }
  if (entry.type !== 'video' && entry.type !== 'image') {
    return 'unknown-type'
  }
  const type = entry.type
  if (typeof entry.path !== 'string' || entry.path.trim() === '') {
    return 'missing-field'
  }
  const source = entry.path.trim()
  // Never cut or forgiven: a path outside the proof folder refuses the card.
  const path = normalizeNativeChatProofMediaPath(source, type) ?? reject()
  const caption = optionalFit(entry.caption, LIMITS.caption, `${field}.caption`, cuts, ignored)
  const where = optionalFit(entry.where, LIMITS.where, `${field}.where`, cuts, ignored)
  const role = entry.role === 'before' || entry.role === 'after' ? entry.role : undefined
  if (!absent(entry.role) && !role) {
    ignored.push(`${field}.role`)
  }
  const full = {
    ...(caption?.full ? { caption: caption.full } : {}),
    ...(where?.full ? { where: where.full } : {})
  }
  return {
    type,
    path,
    source,
    ...(caption ? { caption: caption.text } : {}),
    ...(where ? { where: where.text } : {}),
    ...(role ? { role } : {}),
    ...(caption?.full || where?.full ? { full } : {})
  }
}

function readCheck(
  entry: unknown,
  field: string,
  cuts: Cuts
): NativeChatProofCheck | NativeChatProofDropReason {
  if (!isNativeChatCardRecord(entry)) {
    return 'missing-field'
  }
  const label = fit(entry.label, LIMITS.label, `${field}.label`, cuts)
  const result = fit(entry.result, LIMITS.result, `${field}.result`, cuts)
  if (!label || !result) {
    return 'missing-field'
  }
  const full = {
    ...(label.full ? { label: label.full } : {}),
    ...(result.full ? { result: result.full } : {})
  }
  return {
    label: label.text,
    result: result.text,
    tone: nativeChatProofCheckTone(result.full ?? result.text),
    ...(label.full || result.full ? { full } : {})
  }
}

function readLink(
  entry: unknown,
  field: string,
  cuts: Cuts
): NativeChatProofLink | NativeChatProofDropReason {
  if (!isNativeChatCardRecord(entry)) {
    return 'missing-field'
  }
  const label = fit(entry.label, LIMITS.label, `${field}.label`, cuts)
  const url = typeof entry.url === 'string' ? entry.url.trim() : ''
  if (!label || url === '') {
    return 'missing-field'
  }
  if (url.length > LIMITS.url) {
    return 'invalid-url'
  }
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return 'invalid-url'
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return 'invalid-url'
  }
  return {
    label: label.text,
    url: parsed.toString(),
    ...(label.full ? { full: { label: label.full } } : {})
  }
}

function readAction(
  entry: unknown,
  field: string,
  cuts: Cuts
): NativeChatCardAction | NativeChatProofDropReason {
  if (!isNativeChatCardRecord(entry)) {
    return 'missing-field'
  }
  if (typeof entry.label !== 'string' || entry.label.trim() === '') {
    return 'missing-field'
  }
  if (typeof entry.reply === 'string' && entry.reply.length > LIMITS.actionReply) {
    return 'reply-too-long'
  }
  const label = entry.label.trim()
  const cut = truncateNativeChatProofText(label, LIMITS.actionLabel)
  if (cut !== label) {
    cuts.push(`${field}.label`)
  }
  // Ids are set from the kept position once the section is read.
  return parseNativeChatCardAction({ ...entry, label: cut }, '', true) ?? 'invalid-action'
}

function emptyAdjustments(): NativeChatProofCardAdjustments {
  return {
    truncatedFields: [],
    droppedCounts: { media: 0, checks: 0, links: 0, actions: 0 },
    dropped: [],
    ignoredFields: []
  }
}

/** Every entry is read, even past the maximum, so an unsafe path anywhere still refuses. */
function readSection<T extends object>(
  value: unknown,
  section: NativeChatProofSection,
  adjustments: NativeChatProofCardAdjustments,
  read: (entry: unknown, field: string, cuts: Cuts) => T | NativeChatProofDropReason
): T[] {
  if (absent(value)) {
    return []
  }
  if (!Array.isArray(value)) {
    reject()
  }
  const kept: T[] = []
  value.forEach((entry: unknown, index) => {
    const field = `${section}[${index}]`
    const cuts: Cuts = []
    const item = read(entry, field, cuts)
    if (typeof item === 'string' || kept.length >= LIMITS[section]) {
      adjustments.droppedCounts[section] += 1
      adjustments.dropped.push({
        field,
        reason: typeof item === 'string' ? item : 'over-max'
      })
      return
    }
    kept.push(item)
    adjustments.truncatedFields.push(...cuts)
  })
  return kept
}

function readCard(value: unknown): NativeChatProofCard {
  if (!isNativeChatCardRecord(value)) {
    reject()
  }
  const adjustments = emptyAdjustments()
  const cuts = adjustments.truncatedFields
  const ignored = adjustments.ignoredFields
  // The worktree is an identifier: cutting it would point the chip somewhere else.
  const worktree = typeof value.worktree === 'string' ? value.worktree.trim() : ''
  if (worktree === '' || worktree.length > LIMITS.worktree) {
    reject()
  }
  const title = fit(value.title, LIMITS.title, 'title', cuts) ?? reject()
  const kind = NATIVE_CHAT_PROOF_KINDS.find((known) => known === value.kind)
  if (!absent(value.kind) && !kind) {
    ignored.push('kind')
  }
  const summary = optionalFit(value.summary, LIMITS.summary, 'summary', cuts, ignored)
  const media = readSection(value.media, 'media', adjustments, (entry, field, itemCuts) =>
    readMedia(entry, field, itemCuts, ignored)
  )
  const checks = readSection(value.checks, 'checks', adjustments, readCheck)
  const links = readSection(value.links, 'links', adjustments, readLink)
  const actions = readSection(value.actions, 'actions', adjustments, readAction).map(
    (action, index) => ({ ...action, id: `action-${index}` })
  )
  const full = {
    ...(title.full ? { title: title.full } : {}),
    ...(summary?.full ? { summary: summary.full } : {})
  }
  return {
    worktree,
    title: title.text,
    ...(kind ? { kind } : {}),
    ...(summary ? { summary: summary.text } : {}),
    media,
    checks,
    links,
    actions,
    ...(title.full || summary?.full ? { full } : {}),
    adjustments
  }
}

/** Null for bad JSON, the wrong top-level shape or an unsafe media path. */
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
