import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearLinkPreviewCache, fetchNativeChatLinkPreview } from './link-preview-fetch'
import type { LinkPreviewFetchDeps } from './link-preview-http'

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(16, 1)
])
const PNG_URI = `data:image/png;base64,${PNG.toString('base64')}`

type Route = { status?: number; type?: string; body?: string | Buffer; location?: string }

function deps(routes: Record<string, Route>, addresses: Record<string, string> = {}) {
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    expect(init.credentials).toBe('omit')
    expect(init.redirect).toBe('manual')
    const route = routes[url] ?? { status: 404 }
    const headers = new Headers()
    if (route.type) {
      headers.set('content-type', route.type)
    }
    if (route.location) {
      headers.set('location', route.location)
    }
    const body =
      typeof route.body === 'string' ? route.body : route.body && new Uint8Array(route.body)
    return new Response(body ?? null, { status: route.status ?? 200, headers })
  })
  const resolve = vi.fn(async (host: string) => [addresses[host] ?? '93.184.216.34'])
  return { fetch, resolve } satisfies LinkPreviewFetchDeps
}

beforeEach(() => clearLinkPreviewCache())

describe('fetchNativeChatLinkPreview', () => {
  it('fills a card from the page head, its image and its icon', async () => {
    const page = `<head><meta property="og:title" content="Hello"><meta property="og:image" content="/og.png">
      <link rel="icon" type="image/png" sizes="32x32" href="/i.png"></head>`
    const d = deps({
      'https://example.com/': { type: 'text/html; charset=utf-8', body: page },
      'https://example.com/og.png': { type: 'image/png', body: PNG },
      'https://example.com/i.png': { type: 'image/png', body: PNG }
    })
    expect(await fetchNativeChatLinkPreview({ url: 'https://example.com' }, d)).toEqual({
      url: 'https://example.com/',
      title: 'Hello',
      image: PNG_URI,
      icon: PNG_URI
    })
    await fetchNativeChatLinkPreview({ url: 'https://example.com' }, d)
    expect(d.fetch).toHaveBeenCalledTimes(3)
  })

  it('refuses private hosts, including through a redirect or DNS', async () => {
    const d = deps(
      {
        'https://example.com/go': { status: 302, location: 'http://192.168.1.10/admin' },
        'https://intranet.example.com/': { type: 'text/html', body: '<title>x</title>' }
      },
      { 'intranet.example.com': '10.0.0.5' }
    )
    for (const url of [
      'https://example.com/go',
      'https://intranet.example.com/',
      'http://localhost:3000/',
      'http://[::1]/'
    ]) {
      expect(await fetchNativeChatLinkPreview({ url }, d)).toBeNull()
    }
    expect(d.fetch.mock.calls.map(([url]) => url)).toEqual(['https://example.com/go'])
  })

  it('treats a link straight to an image as its own preview', async () => {
    const d = deps({ 'https://example.com/shot.png': { type: 'image/png', body: PNG } })
    expect(await fetchNativeChatLinkPreview({ url: 'https://example.com/shot.png' }, d)).toEqual({
      url: 'https://example.com/shot.png',
      image: PNG_URI
    })
  })
})
