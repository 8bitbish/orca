// @vitest-environment happy-dom
// @vitest-environment-options {"settings":{"disableIframePageLoading":true,"disableJavaScriptFileLoading":true,"disableCSSFileLoading":true,"navigation":{"disableChildFrameNavigation":true}}}
import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NATIVE_CHAT_MARKUP_SIZE_MESSAGE } from '../../../../src/shared/native-chat-markup-preview-policy'
import {
  MARKUP_PREVIEW_ENGINE_HASH,
  MARKUP_PREVIEW_ENGINE_JS
} from './markup-preview-engine.generated'
import { buildMobileMarkupPreviewDocument } from './mobile-markup-preview-document'
import { mobileMarkupPreviewKind } from './mobile-markup-preview-kind'

const HOSTILE = [
  '<style>.x{color:red}</style>',
  '<p class="x" onclick="alert(1)">hello</p>',
  '<script>alert(1)</script>',
  '<img src="https://evil.example/t.png"><img src="data:image/png;base64,AAAA">',
  '<a href="https://evil.example">out</a><a href="#top">in</a>',
  '<iframe src="https://evil.example"></iframe><form><input></form>',
  '<svg viewBox="0 0 10 10"><rect width="10" height="10"/></svg>',
  '</script><script>alert(2)</script>'
].join('')

function cspOf(doc: string): string {
  return /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(doc)?.[1] ?? ''
}

function runEngine(doc: string): string[] {
  const parsed = new DOMParser().parseFromString(doc, 'text/html')
  const block = parsed.getElementById('orca-markup-source')
  document.head.innerHTML = ''
  document.body.innerHTML = ''
  const data = document.createElement('script')
  data.type = 'application/json'
  data.id = 'orca-markup-source'
  data.textContent = block?.textContent ?? ''
  document.head.append(data)
  const posted: string[] = []
  vi.stubGlobal('ReactNativeWebView', { postMessage: (message: string) => posted.push(message) })
  new Function(MARKUP_PREVIEW_ENGINE_JS)()
  return posted
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('mobile markup preview', () => {
  it('pins exactly the bundled engine in the CSP', () => {
    const expected = `sha256-${createHash('sha256').update(MARKUP_PREVIEW_ENGINE_JS, 'utf8').digest('base64')}`
    expect(MARKUP_PREVIEW_ENGINE_HASH).toBe(expected)
    const csp = cspOf(buildMobileMarkupPreviewDocument('<p>x</p>', 'html'))
    const scriptSrc = csp.split('; ').find((directive) => directive.startsWith('script-src'))
    expect(scriptSrc).toBe(`script-src '${expected}'`)
    expect(csp).toContain("default-src 'none'")
  })

  it('keeps agent markup inert until the engine sanitizes it', () => {
    const doc = buildMobileMarkupPreviewDocument(HOSTILE, 'widget')
    // The JSON block and the engine; the markup's own </script> cannot open a third.
    expect(doc.match(/<script/gi)).toHaveLength(2)
    expect(doc).not.toContain('<script>alert')
  })

  // DOMPurify's own stripping is not exercised here: under happy-dom it leaves scripts in
  // place (desktop's preview test says the same), so that half is checked on a real WebView.
  it('strips network references and reports its height', () => {
    const posted = runEngine(buildMobileMarkupPreviewDocument(HOSTILE, 'html'))
    const body = document.body
    expect(Array.from(body.querySelectorAll('img'), (img) => img.getAttribute('src'))).toEqual([
      'data:image/png;base64,AAAA'
    ])
    expect(Array.from(body.querySelectorAll('a'), (a) => a.getAttribute('href'))).toEqual([
      null,
      '#top'
    ])
    expect(JSON.parse(posted[0] ?? '{}')).toMatchObject({ type: NATIVE_CHAT_MARKUP_SIZE_MESSAGE })
  })

  it('routes only html, svg and widget fences', () => {
    expect(
      ['HTML', 'svg', 'widget', 'mermaid', 'tsx', undefined].map(mobileMarkupPreviewKind)
    ).toEqual(['html', 'svg', 'widget', null, null, null])
  })
})
