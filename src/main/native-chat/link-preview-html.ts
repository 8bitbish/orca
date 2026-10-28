// Reads a link card's metadata out of a page's <head>: Open Graph, then Twitter
// tags, then <title> / meta description, plus the site's icons. Regex over the head
// only; a page that hides its tags behind scripts just gets the fallback card.

export type LinkPreviewPageMeta = {
  title?: string
  description?: string
  site?: string
  /** Absolute image URL. */
  image?: string
  /** Absolute icon URLs, best first; ends with /favicon.ico. */
  icons: string[]
}

const TAG = /<(meta|link)\b([^>]*)>/gi
const ATTRIBUTE = /([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g
const TITLE = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  middot: '·',
  copy: '©',
  reg: '®',
  trade: '™'
}

export function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (whole, entity: string) => {
    if (entity[0] === '#') {
      const code =
        entity[1] === 'x' || entity[1] === 'X'
          ? Number.parseInt(entity.slice(2), 16)
          : Number.parseInt(entity.slice(1), 10)
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : whole
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? whole
  })
}

function attributes(source: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const match of source.matchAll(ATTRIBUTE)) {
    const name = match[1].toLowerCase()
    if (!out.has(name)) {
      out.set(name, decodeHtmlEntities(match[2] ?? match[3] ?? match[4] ?? ''))
    }
  }
  return out
}

function absolute(href: string | undefined, base: string): string | undefined {
  if (!href || href.trim() === '' || href.trim().startsWith('data:')) {
    return undefined
  }
  try {
    const url = new URL(href.trim(), base)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : undefined
  } catch {
    return undefined
  }
}

function first(meta: Map<string, string>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = meta.get(key)?.trim()
    if (value) {
      return value
    }
  }
  return undefined
}

function iconRank(rel: string, type: string, href: string, sizes: string): number {
  if (rel.split(/\s+/).includes('mask-icon')) {
    return -1
  }
  const vector = type.includes('svg') || /\.svg(?:$|[?#])/i.test(href)
  const raster = /png|gif|webp|jpe?g/.test(type) || /\.(?:png|gif|webp|jpe?g)(?:$|[?#])/i.test(href)
  const size = Number.parseInt(sizes, 10) || 0
  if (rel.includes('apple-touch-icon')) {
    return 2
  }
  if (vector || (raster && size >= 32)) {
    return 4
  }
  return raster ? 3 : 1
}

/** The head of `html` (or all of it without a </head>) as link card metadata. */
export function readLinkPreviewHtmlMeta(html: string, pageUrl: string): LinkPreviewPageMeta {
  const headEnd = html.search(/<\/head\s*>|<body\b/i)
  const head = (headEnd === -1 ? html : html.slice(0, headEnd)).replace(/<!--[\s\S]*?-->/g, '')
  const meta = new Map<string, string>()
  const icons: { href: string; rank: number; order: number }[] = []
  for (const match of head.matchAll(TAG)) {
    const attrs = attributes(match[2])
    if (match[1].toLowerCase() === 'meta') {
      const key = (attrs.get('property') ?? attrs.get('name') ?? '').toLowerCase()
      const content = attrs.get('content')
      if (key && content !== undefined && !meta.has(key)) {
        meta.set(key, content)
      }
      continue
    }
    const rel = (attrs.get('rel') ?? '').toLowerCase()
    const href = absolute(attrs.get('href'), pageUrl)
    if (href && rel.includes('icon')) {
      const rank = iconRank(
        rel,
        (attrs.get('type') ?? '').toLowerCase(),
        href,
        attrs.get('sizes') ?? ''
      )
      if (rank >= 0) {
        icons.push({ href, rank, order: icons.length })
      }
    }
  }
  const titleTag = TITLE.exec(head)?.[1]
  const fallbackIcon = absolute('/favicon.ico', pageUrl)
  const ordered = icons
    .sort((a, b) => b.rank - a.rank || a.order - b.order)
    .map((icon) => icon.href)
  if (fallbackIcon && !ordered.includes(fallbackIcon)) {
    ordered.push(fallbackIcon)
  }
  return {
    title:
      first(meta, ['og:title', 'twitter:title']) ??
      (titleTag ? decodeHtmlEntities(titleTag).trim() || undefined : undefined),
    description: first(meta, ['og:description', 'twitter:description', 'description']),
    site: first(meta, ['og:site_name', 'application-name']),
    image: absolute(
      first(meta, [
        'og:image:secure_url',
        'og:image',
        'og:image:url',
        'twitter:image',
        'twitter:image:src'
      ]),
      pageUrl
    ),
    icons: ordered
  }
}
