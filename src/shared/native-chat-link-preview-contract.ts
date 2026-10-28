// What the host returns for one link card's page, over desktop IPC
// (`nativeChat:linkPreview`) and runtime RPC (`nativeChat.linkPreview`) alike. The
// host fetches the page and its images; the renderer only ever gets data: URIs.

import { nativeChatLinkCardText, nativeChatLinkCardUrl } from './native-chat-link-cards-payload'

export type NativeChatLinkPreviewRequest = {
  url: string
  /** The card's own image URL, fetched in place of the page's og:image. */
  image?: string
}

export type NativeChatLinkPreviewResult = {
  /** The page's final URL after redirects. */
  url: string
  title?: string
  description?: string
  site?: string
  /** A raster `data:image/…;base64,` thumbnail. */
  image?: string
  /** The site icon as a data: URI (raster, ICO or SVG). */
  icon?: string
}

export const NATIVE_CHAT_LINK_PREVIEW_TITLE_MAX = 200
export const NATIVE_CHAT_LINK_PREVIEW_DESCRIPTION_MAX = 300
export const NATIVE_CHAT_LINK_PREVIEW_SITE_MAX = 60

const THUMBNAIL_DATA_URI = /^data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/]+={0,2}$/
const ICON_DATA_URI =
  /^data:image\/(?:png|jpeg|gif|webp|x-icon|vnd\.microsoft\.icon|svg\+xml);base64,[A-Za-z0-9+/]+={0,2}$/

function dataUri(pattern: RegExp): (raw: unknown) => string | undefined {
  return (raw) => (typeof raw === 'string' && pattern.test(raw) ? raw : undefined)
}

/** A host reply, keeping only well-formed fields; null when not a reply at all. */
export function parseNativeChatLinkPreviewResult(
  value: unknown
): NativeChatLinkPreviewResult | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }
  const reply = new Map<string, unknown>(Object.entries(value))
  const field = <T>(key: string, read: (raw: unknown) => T | undefined): T | undefined =>
    read(reply.get(key))
  const url = field('url', (raw) => nativeChatLinkCardUrl(raw) ?? undefined)
  if (!url) {
    return null
  }
  const result: NativeChatLinkPreviewResult = { url }
  const title = field('title', (raw) =>
    nativeChatLinkCardText(raw, NATIVE_CHAT_LINK_PREVIEW_TITLE_MAX)
  )
  const description = field('description', (raw) =>
    nativeChatLinkCardText(raw, NATIVE_CHAT_LINK_PREVIEW_DESCRIPTION_MAX)
  )
  const site = field('site', (raw) =>
    nativeChatLinkCardText(raw, NATIVE_CHAT_LINK_PREVIEW_SITE_MAX)
  )
  const image = field('image', dataUri(THUMBNAIL_DATA_URI))
  const icon = field('icon', dataUri(ICON_DATA_URI))
  if (title) {
    result.title = title
  }
  if (description) {
    result.description = description
  }
  if (site) {
    result.site = site
  }
  if (image) {
    result.image = image
  }
  if (icon) {
    result.icon = icon
  }
  return result
}
