// The bounded HTTP layer under link cards: only public http(s) hosts, no cookies or
// credentials, redirects followed by hand so every hop is re-checked, and every
// read capped in time and bytes.

import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { nativeChatLinkCardUrl } from '../../shared/native-chat-link-cards-payload'

const TIMEOUT_MS = 8000
const MAX_REDIRECTS = 5
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 OrcaLinkPreview/1.0'

export type LinkPreviewFetchDeps = {
  fetch: (url: string, init: RequestInit) => Promise<Response>
  /** Every address a host name resolves to. */
  resolve: (hostname: string) => Promise<string[]>
}

export const defaultLinkPreviewFetchDeps: LinkPreviewFetchDeps = {
  fetch: (input, init) => fetch(input, init),
  resolve: async (hostname) => (await lookup(hostname, { all: true })).map((entry) => entry.address)
}

function isPrivateIPv4(address: string): boolean {
  const [a, b] = address.split('.').map(Number)
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  )
}

/** Loopback, private, link-local, CGNAT, multicast or unspecified: never fetched. */
export function isNonPublicAddress(address: string): boolean {
  const bare = address.replace(/^\[|\]$/g, '').toLowerCase()
  const kind = isIP(bare)
  if (kind === 4) {
    return isPrivateIPv4(bare)
  }
  if (kind !== 6) {
    return true
  }
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(bare)
  if (mapped) {
    return isPrivateIPv4(mapped[1])
  }
  return (
    bare === '::' ||
    bare === '::1' ||
    /^f[cd]/.test(bare) ||
    /^fe[89ab]/.test(bare) ||
    bare.startsWith('ff')
  )
}

async function isPublicHost(hostname: string, deps: LinkPreviewFetchDeps): Promise<boolean> {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) {
    return false
  }
  if (isIP(host) !== 0) {
    return !isNonPublicAddress(host)
  }
  try {
    const addresses = await deps.resolve(host)
    return addresses.length > 0 && !addresses.some(isNonPublicAddress)
  } catch {
    return false
  }
}

export type LinkPreviewFetched = { url: string; contentType: string; bytes: Buffer }

async function readBounded(response: Response, maxBytes: number): Promise<Buffer | null> {
  const declared = Number(response.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel().catch(() => {})
    return null
  }
  if (!response.body) {
    return Buffer.alloc(0)
  }
  const reader = response.body.getReader()
  const chunks: Buffer[] = []
  let length = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }
    length += value.byteLength
    if (length > maxBytes) {
      await reader.cancel().catch(() => {})
      return null
    }
    chunks.push(Buffer.from(value))
  }
  return Buffer.concat(chunks)
}

/** Cookies a redirect chain sets for itself (sign-in bounces), kept per host for this
 *  one fetch only; the user's own cookies are never read or sent. */
class RedirectCookies {
  private readonly byHost = new Map<string, Map<string, string>>()

  store(host: string, response: Response): void {
    for (const header of response.headers.getSetCookie()) {
      const pair = header.split(';', 1)[0]
      const equals = pair.indexOf('=')
      if (equals > 0) {
        const jar = this.byHost.get(host) ?? new Map<string, string>()
        jar.set(pair.slice(0, equals).trim(), pair.slice(equals + 1).trim())
        this.byHost.set(host, jar)
      }
    }
  }

  header(host: string): Record<string, string> {
    const jar = this.byHost.get(host)
    return jar && jar.size > 0
      ? { cookie: [...jar].map(([name, value]) => `${name}=${value}`).join('; ') }
      : {}
  }
}

/** GET with redirects followed by hand, so each hop is checked; null on any refusal. */
export async function fetchLinkPreviewBounded(
  start: string,
  accept: string,
  maxBytes: number,
  deps: LinkPreviewFetchDeps,
  { truncate = false }: { truncate?: boolean } = {}
): Promise<LinkPreviewFetched | null> {
  const signal = AbortSignal.timeout(TIMEOUT_MS)
  let url = start
  const cookies = new RedirectCookies()
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const checked = nativeChatLinkCardUrl(url)
      const host = checked ? new URL(checked).hostname : ''
      if (!checked || !(await isPublicHost(host, deps))) {
        return null
      }
      const response = await deps.fetch(checked, {
        redirect: 'manual',
        credentials: 'omit',
        signal,
        headers: {
          accept,
          'user-agent': USER_AGENT,
          'accept-language': 'en',
          ...cookies.header(host)
        }
      })
      const location = response.headers.get('location')
      if (response.status >= 300 && response.status < 400 && location) {
        cookies.store(host, response)
        await response.body?.cancel().catch(() => {})
        url = new URL(location, checked).toString()
        continue
      }
      if (!response.ok) {
        await response.body?.cancel().catch(() => {})
        return null
      }
      const contentType = (response.headers.get('content-type') ?? '').toLowerCase()
      // A page's <head> is all a card needs, so an oversized page is read only that far.
      const bytes = truncate
        ? await readPrefix(response, maxBytes)
        : await readBounded(response, maxBytes)
      return bytes ? { url: checked, contentType, bytes } : null
    }
    return null
  } catch {
    return null
  }
}

async function readPrefix(response: Response, maxBytes: number): Promise<Buffer> {
  if (!response.body) {
    return Buffer.alloc(0)
  }
  const reader = response.body.getReader()
  const chunks: Buffer[] = []
  let length = 0
  while (length < maxBytes) {
    const { done, value } = await reader.read()
    if (done) {
      return Buffer.concat(chunks)
    }
    chunks.push(Buffer.from(value))
    length += value.byteLength
  }
  await reader.cancel().catch(() => {})
  return Buffer.concat(chunks).subarray(0, maxBytes)
}
