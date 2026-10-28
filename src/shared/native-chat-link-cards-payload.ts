// The JSON body of the ```link-cards fence: web pages the assistant shares, drawn as
// link previews. Closed schema; anything off it shows the raw block. Fields an item
// leaves out are filled from the page itself by the host (never the renderer).

import { truncateNativeChatProofText } from './native-chat-proof-card-text'

export const NATIVE_CHAT_LINK_CARDS_FENCE = 'link-cards'

export type NativeChatLinkCardsLayout = 'list' | 'grid'

export type NativeChatLinkCardItem = {
  url: string
  title?: string
  description?: string
  /** An http(s) image URL; the host fetches it, the renderer only gets the bytes. */
  image?: string
  site?: string
}

export type NativeChatLinkCards = {
  layout: NativeChatLinkCardsLayout
  items: NativeChatLinkCardItem[]
  /** Items past the shown maximum, noted as "+N more". */
  hidden: number
}

export const NATIVE_CHAT_LINK_CARDS_MAX_ITEMS = 8
/** Past this many items the fence is not a card list at all. */
const MAX_RAW_ITEMS = 50
export const NATIVE_CHAT_LINK_CARD_MAX_URL_LENGTH = 2048
const MAX_TITLE_LENGTH = 200
const MAX_DESCRIPTION_LENGTH = 300
const MAX_SITE_LENGTH = 60

const CARD_KEYS = new Set(['layout', 'items'])
const ITEM_KEYS = new Set(['url', 'title', 'description', 'image', 'site'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** An absolute http(s) URL without credentials, normalized; null otherwise. */
export function nativeChatLinkCardUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > NATIVE_CHAT_LINK_CARD_MAX_URL_LENGTH) {
    return null
  }
  let parsed: URL
  try {
    parsed = new URL(value.trim())
  } catch {
    return null
  }
  if (
    (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') ||
    parsed.username !== '' ||
    parsed.password !== '' ||
    parsed.hostname === ''
  ) {
    return null
  }
  return parsed.toString()
}

/** One line of display text: whitespace folded, cut to `max`; undefined when blank. */
export function nativeChatLinkCardText(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  const text = value.replace(/\s+/g, ' ').trim()
  return text === '' ? undefined : truncateNativeChatProofText(text, max)
}

/** Optional text field: absent, null or a string; anything else is off the schema. */
function textField(value: unknown, max: number): string | undefined | null {
  if (value === undefined || value === null) {
    return undefined
  }
  return typeof value === 'string' ? nativeChatLinkCardText(value, max) : null
}

function parseItem(value: unknown): NativeChatLinkCardItem | null {
  if (!isRecord(value) || Object.keys(value).some((key) => !ITEM_KEYS.has(key))) {
    return null
  }
  const url = nativeChatLinkCardUrl(value.url)
  const title = textField(value.title, MAX_TITLE_LENGTH)
  const description = textField(value.description, MAX_DESCRIPTION_LENGTH)
  const site = textField(value.site, MAX_SITE_LENGTH)
  const image =
    value.image === undefined || value.image === null
      ? undefined
      : nativeChatLinkCardUrl(value.image)
  if (url === null || title === null || description === null || site === null || image === null) {
    return null
  }
  const item: NativeChatLinkCardItem = { url }
  if (title) {
    item.title = title
  }
  if (description) {
    item.description = description
  }
  if (image) {
    item.image = image
  }
  if (site) {
    item.site = site
  }
  return item
}

export function parseNativeChatLinkCardsValue(value: unknown): NativeChatLinkCards | null {
  if (!isRecord(value) || Object.keys(value).some((key) => !CARD_KEYS.has(key))) {
    return null
  }
  const layout = value.layout ?? 'list'
  if (layout !== 'list' && layout !== 'grid') {
    return null
  }
  const raw = value.items
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_RAW_ITEMS) {
    return null
  }
  const items: NativeChatLinkCardItem[] = []
  for (const entry of raw) {
    const item = parseItem(entry)
    if (!item) {
      return null
    }
    items.push(item)
  }
  return {
    layout,
    items: items.slice(0, NATIVE_CHAT_LINK_CARDS_MAX_ITEMS),
    hidden: Math.max(0, items.length - NATIVE_CHAT_LINK_CARDS_MAX_ITEMS)
  }
}

/** The fence body as a card list, or null when it is not valid JSON on the schema. */
export function parseNativeChatLinkCards(source: string): NativeChatLinkCards | null {
  let value: unknown
  try {
    value = JSON.parse(source)
  } catch {
    return null
  }
  return parseNativeChatLinkCardsValue(value)
}

/** The host name a card falls back to for its site label, without a leading www. */
export function nativeChatLinkCardHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** A title for a page that gave none: host and path, e.g. `example.com/docs/intro`. */
export function nativeChatLinkCardFallbackTitle(url: string): string {
  try {
    const parsed = new URL(url)
    const path = parsed.pathname.replace(/\/+$/, '')
    return `${parsed.hostname.replace(/^www\./, '')}${path}`
  } catch {
    return url
  }
}
