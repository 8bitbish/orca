// @vitest-environment happy-dom

import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  buildNativeChatMarkupPreviewDocument,
  NATIVE_CHAT_MARKUP_PREVIEW_CSP,
  NATIVE_CHAT_MARKUP_PREVIEW_SANDBOX,
  NATIVE_CHAT_MARKUP_SIZE_SCRIPT,
  NATIVE_CHAT_MARKUP_SIZE_SCRIPT_HASH,
  stripNativeChatMarkupNetworkRefs
} from './native-chat-markup-preview-document'

function build(source: string, kind: 'html' | 'svg' = 'html'): string {
  return buildNativeChatMarkupPreviewDocument({
    source,
    kind,
    colorScheme: 'dark',
    tokenCss: '--foreground:#fafafa;--card:#171717'
  })
}

describe('native chat markup preview document', () => {
  it('pins the one allowed script by its hash', () => {
    const digest = createHash('sha256').update(NATIVE_CHAT_MARKUP_SIZE_SCRIPT).digest('base64')
    expect(NATIVE_CHAT_MARKUP_SIZE_SCRIPT_HASH).toBe(`sha256-${digest}`)
  })

  it('forbids all network and every script but the sizing one', () => {
    const directives = NATIVE_CHAT_MARKUP_PREVIEW_CSP.split('; ')
    expect(directives).toContain("default-src 'none'")
    expect(directives).toContain(`script-src '${NATIVE_CHAT_MARKUP_SIZE_SCRIPT_HASH}'`)
    expect(directives).toContain("style-src 'unsafe-inline'")
    expect(directives).toContain('img-src data:')
    expect(NATIVE_CHAT_MARKUP_PREVIEW_CSP).not.toContain('unsafe-eval')
    expect(NATIVE_CHAT_MARKUP_PREVIEW_CSP).not.toMatch(/script-src[^;]*unsafe-inline/)
    expect(NATIVE_CHAT_MARKUP_PREVIEW_CSP).not.toContain('connect-src')
    expect(NATIVE_CHAT_MARKUP_PREVIEW_SANDBOX.split(/\s+/)).toEqual(['allow-scripts'])
  })

  it('parses the CSP before any agent markup', () => {
    const doc = build('<style>p{color:red}</style><p>hi</p>')
    const csp = doc.indexOf('http-equiv="Content-Security-Policy"')
    expect(csp).toBeGreaterThan(-1)
    expect(csp).toBeLessThan(doc.indexOf('p{color:red}'))
    expect(csp).toBeLessThan(doc.indexOf('<p>hi</p>'))
    expect(doc).toContain(`content="${NATIVE_CHAT_MARKUP_PREVIEW_CSP}"`)
    expect(doc).toContain('--foreground:#fafafa')
    expect(doc).toContain('<html class="dark">')
  })

  // DOMPurify's own stripping is not exercised here: under happy-dom it leaves
  // handlers and frames in place, so a test of it would only test the stub DOM.
  // The CSP and sandbox above hold regardless; stripping is checked in Chromium.

  it('drops media the CSP would block, so a reply shows no broken images', () => {
    const root = document.createElement('div')
    root.innerHTML =
      '<img src="https://example.com/a.png" alt="gone"><img alt="no source">' +
      '<img src="data:image/png;base64,AAAA" alt="kept" srcset="https://example.com/b.png 2x">' +
      '<svg><image href="https://example.com/c.png"></image><image href="data:image/png;base64,AAAA"></image></svg>' +
      '<video poster="https://example.com/p.png"></video>' +
      '<a href="https://example.com">out</a><a href="#here">in</a>'
    stripNativeChatMarkupNetworkRefs(root)
    const html = root.innerHTML
    expect(html).not.toContain('example.com')
    expect(root.querySelectorAll('img')).toHaveLength(1)
    expect(root.querySelector('img')?.getAttribute('alt')).toBe('kept')
    expect(root.querySelectorAll('image')).toHaveLength(1)
    expect(root.querySelector('video')).toBeNull()
    expect(html).toContain('<a>out</a>')
    expect(html).toContain('href="#here"')
  })

  it('keeps a bare svg fence renderable', () => {
    const doc = build('<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>', 'svg')
    expect(doc).toContain('<circle')
    expect(doc).toContain('justify-content:center')
  })
})
