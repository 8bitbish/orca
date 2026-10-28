// Fetches what a link card needs from the web: the page's <head> metadata, its
// preview image and site icon, for the desktop renderer (IPC) and paired clients
// (runtime RPC). Cached in memory; the safety rules live in link-preview-http.

import {
  nativeChatLinkCardText,
  nativeChatLinkCardUrl
} from '../../shared/native-chat-link-cards-payload'
import {
  NATIVE_CHAT_LINK_PREVIEW_DESCRIPTION_MAX,
  NATIVE_CHAT_LINK_PREVIEW_SITE_MAX,
  NATIVE_CHAT_LINK_PREVIEW_TITLE_MAX,
  type NativeChatLinkPreviewRequest,
  type NativeChatLinkPreviewResult
} from '../../shared/native-chat-link-preview-contract'
import { readLinkPreviewHtmlMeta } from './link-preview-html'
import {
  defaultLinkPreviewFetchDeps,
  fetchLinkPreviewBounded,
  type LinkPreviewFetchDeps,
  type LinkPreviewFetched
} from './link-preview-http'
import {
  reencodeSlackCacheImage,
  slackCacheImageCodec,
  sniffSlackCacheImageMime
} from './slack-cache-image'

const MAX_HTML_BYTES = 768 * 1024
const MAX_IMAGE_BYTES = 6 * 1024 * 1024
const MAX_ICON_BYTES = 128 * 1024
const MAX_ICON_TRIES = 3
const THUMBNAIL_WIDTH = 640
const MAX_THUMBNAIL_BYTES = 400 * 1024
const CACHE_LIMIT = 200
const CACHE_TTL_MS = 6 * 60 * 60 * 1000
const FAILURE_TTL_MS = 10 * 60 * 1000

function charset(contentType: string, bytes: Buffer): string {
  const declared = /charset=["']?([\w-]+)/i.exec(contentType)?.[1]
  if (declared) {
    return declared
  }
  const sniff = bytes.subarray(0, 4096).toString('latin1')
  return /<meta[^>]+charset=["']?([\w-]+)/i.exec(sniff)?.[1] ?? 'utf-8'
}

function decodeHtml(fetched: LinkPreviewFetched): string {
  try {
    return new TextDecoder(charset(fetched.contentType, fetched.bytes)).decode(fetched.bytes)
  } catch {
    return new TextDecoder('utf-8').decode(fetched.bytes)
  }
}

function dataUri(mime: string, bytes: Buffer): string {
  return `data:${mime};base64,${bytes.toString('base64')}`
}

/** A raster thumbnail as a data: URI, scaled down when a codec is installed. */
function thumbnail(bytes: Buffer): string | undefined {
  const mime = sniffSlackCacheImageMime(bytes)
  if (!mime) {
    return undefined
  }
  const decoded = slackCacheImageCodec()?.decode(bytes)
  if (decoded && decoded.width > 0 && decoded.height > 0) {
    const encoded = reencodeSlackCacheImage(decoded, mime, THUMBNAIL_WIDTH, MAX_THUMBNAIL_BYTES)
    return encoded?.src
  }
  // A bare Node host cannot re-encode; a small original still makes a thumbnail.
  return bytes.length <= MAX_THUMBNAIL_BYTES ? dataUri(mime, bytes) : undefined
}

function iconMime(bytes: Buffer): string | undefined {
  const raster = sniffSlackCacheImageMime(bytes)
  if (raster) {
    return raster
  }
  if (bytes.length >= 4 && bytes.readUInt32BE(0) === 0x00000100) {
    return 'image/x-icon'
  }
  const head = bytes.subarray(0, 512).toString('utf8').trimStart()
  return /^(?:<\?xml[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(head)
    ? 'image/svg+xml'
    : undefined
}

async function fetchThumbnail(
  url: string,
  deps: LinkPreviewFetchDeps
): Promise<string | undefined> {
  const fetched = await fetchLinkPreviewBounded(url, 'image/*', MAX_IMAGE_BYTES, deps)
  return fetched ? thumbnail(fetched.bytes) : undefined
}

async function fetchIcon(urls: readonly string[], deps: LinkPreviewFetchDeps) {
  for (const url of urls.slice(0, MAX_ICON_TRIES)) {
    const fetched = await fetchLinkPreviewBounded(url, 'image/*', MAX_ICON_BYTES, deps)
    const mime = fetched ? iconMime(fetched.bytes) : undefined
    if (fetched && mime) {
      return dataUri(mime, fetched.bytes)
    }
  }
  return undefined
}

async function buildPreview(
  request: NativeChatLinkPreviewRequest,
  deps: LinkPreviewFetchDeps
): Promise<NativeChatLinkPreviewResult | null> {
  const page = await fetchLinkPreviewBounded(
    request.url,
    'text/html,application/xhtml+xml;q=0.9,image/*;q=0.8,*/*;q=0.5',
    MAX_HTML_BYTES,
    deps,
    { truncate: true }
  )
  if (!page) {
    const image = request.image ? await fetchThumbnail(request.image, deps) : undefined
    return image ? { url: request.url, image } : null
  }
  const result: NativeChatLinkPreviewResult = { url: page.url }
  if (page.contentType.startsWith('image/')) {
    // A link straight to an image is its own preview.
    result.image = thumbnail(page.bytes)
    return result
  }
  if (!/text\/html|application\/xhtml\+xml/.test(page.contentType)) {
    return result
  }
  const meta = readLinkPreviewHtmlMeta(decodeHtml(page), page.url)
  const title = nativeChatLinkCardText(meta.title, NATIVE_CHAT_LINK_PREVIEW_TITLE_MAX)
  const description = nativeChatLinkCardText(
    meta.description,
    NATIVE_CHAT_LINK_PREVIEW_DESCRIPTION_MAX
  )
  const site = nativeChatLinkCardText(meta.site, NATIVE_CHAT_LINK_PREVIEW_SITE_MAX)
  const imageUrl = request.image ?? meta.image
  const [image, icon] = await Promise.all([
    imageUrl ? fetchThumbnail(imageUrl, deps) : undefined,
    fetchIcon(meta.icons, deps)
  ])
  return Object.assign(
    result,
    title && { title },
    description && { description },
    site && { site },
    image && { image },
    icon && { icon }
  )
}

type CacheEntry = { expires: number; result: Promise<NativeChatLinkPreviewResult | null> }
const cache = new Map<string, CacheEntry>()

export function clearLinkPreviewCache(): void {
  cache.clear()
}

/** A card's page preview, or null when nothing could be fetched; never throws. */
export async function fetchNativeChatLinkPreview(
  request: NativeChatLinkPreviewRequest,
  deps: LinkPreviewFetchDeps = defaultLinkPreviewFetchDeps
): Promise<NativeChatLinkPreviewResult | null> {
  const url = nativeChatLinkCardUrl(request.url)
  const image = request.image === undefined ? undefined : nativeChatLinkCardUrl(request.image)
  if (!url || image === null) {
    return null
  }
  const key = `${url}\n${image ?? ''}`
  const now = Date.now()
  const hit = cache.get(key)
  if (hit && hit.expires > now) {
    // Re-inserted so the map's order stays least recently used first.
    cache.delete(key)
    cache.set(key, hit)
    return hit.result
  }
  const entry: CacheEntry = {
    expires: now + CACHE_TTL_MS,
    result: buildPreview(image ? { url, image } : { url }, deps).catch(() => null)
  }
  cache.set(key, entry)
  void entry.result.then((result) => {
    if (result === null) {
      entry.expires = Date.now() + FAILURE_TTL_MS
    }
  })
  while (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) {
      break
    }
    cache.delete(oldest)
  }
  return entry.result
}
