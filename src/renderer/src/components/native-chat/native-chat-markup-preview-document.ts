// The document a chat reply's ```html / ```svg / ```widget fence is previewed in.
//
// This is agent-authored markup, so it only ever runs inside an iframe sandboxed
// WITHOUT allow-same-origin: an opaque origin with no reach into the parent DOM,
// the preload bridge, IPC or Node. Layered on top:
//  - DOMPurify strips scripts, handlers, frames, forms, meta refreshes and links
//    before the markup reaches the frame;
//  - the CSP meta parses before any of that markup and forbids all network
//    (default-src 'none'), allowing inline styles and data: images/fonts only;
//  - the built-in style kit (native-chat-markup-style-kit.ts) is plain CSS, so a
//    reply looks finished with classes alone and never needs a script to;
//  - the one script allowed is the sizing script below, pinned by its hash, so
//    `allow-scripts` admits exactly that and nothing the agent wrote. It posts
//    the content height so the card can fit it; nothing else crosses the frame.

import DOMPurify from 'dompurify'
import { NATIVE_CHAT_MARKUP_STYLE_KIT } from './native-chat-markup-style-kit'

export const NATIVE_CHAT_MARKUP_SIZE_MESSAGE = 'orca-native-chat-markup-size'

export const NATIVE_CHAT_MARKUP_SIZE_SCRIPT = `(function(){var post=function(){var body=document.body;if(body){parent.postMessage({type:'${NATIVE_CHAT_MARKUP_SIZE_MESSAGE}',height:Math.ceil(Math.max(body.scrollHeight,body.getBoundingClientRect().height))},'*')}};document.addEventListener('DOMContentLoaded',function(){post();new ResizeObserver(post).observe(document.body)});addEventListener('load',post)})()`

/** SHA-256 of the sizing script; a test recomputes it so the two cannot drift. */
export const NATIVE_CHAT_MARKUP_SIZE_SCRIPT_HASH =
  'sha256-2vFGQ8iSTd6jbgxLE9+NrcfWSK8oyxhDKC59Lt4Cy/U='

export const NATIVE_CHAT_MARKUP_PREVIEW_CSP = [
  "default-src 'none'",
  `script-src '${NATIVE_CHAT_MARKUP_SIZE_SCRIPT_HASH}'`,
  "style-src 'unsafe-inline'",
  'img-src data:',
  'font-src data:',
  "base-uri 'none'",
  "form-action 'none'"
].join('; ')

/** `sandbox` for the preview frame. SECURITY: never add allow-same-origin. */
export const NATIVE_CHAT_MARKUP_PREVIEW_SANDBOX = 'allow-scripts'

export type NativeChatMarkupKind = 'html' | 'svg' | 'widget'

const FORBIDDEN_TAGS = [
  'base',
  'embed',
  'form',
  'frame',
  'frameset',
  'iframe',
  'link',
  'meta',
  'noscript',
  'object',
  'portal',
  'script'
]

const LINK_ATTRIBUTES = ['href', 'xlink:href']
const MEDIA_SELECTOR = 'img, image, video, audio, source, track, input[type="image"]'
const MEDIA_SOURCE_ATTRIBUTES = ['src', 'href', 'xlink:href', 'poster']

function isInlineData(value: string): boolean {
  return value.trim().toLowerCase().startsWith('data:')
}

/** Drops what the CSP would only block: outbound link targets, and media whose
 *  source is not inline data, which would otherwise paint as a broken image. */
export function stripNativeChatMarkupNetworkRefs(root: Element): void {
  for (const anchor of root.querySelectorAll('a')) {
    for (const attribute of LINK_ATTRIBUTES) {
      const value = anchor.getAttribute(attribute)
      if (value !== null && !value.trim().startsWith('#')) {
        anchor.removeAttribute(attribute)
      }
    }
  }
  for (const element of root.querySelectorAll('[srcset]')) {
    element.removeAttribute('srcset')
  }
  for (const media of Array.from(root.querySelectorAll(MEDIA_SELECTOR))) {
    const sources = MEDIA_SOURCE_ATTRIBUTES.map((attribute) =>
      media.getAttribute(attribute)
    ).filter((value): value is string => value !== null)
    const external = sources.some((value) => !isInlineData(value))
    const sourceless = media.localName === 'img' && sources.length === 0
    if (external || sourceless) {
      media.remove()
    }
  }
}

/** Agent markup reduced to an inert body, whether it arrived as a whole document
 *  or a fragment: a document's head styles move into the body, where they still
 *  apply. Nothing left in it can reach the network. */
export function sanitizeNativeChatMarkup(source: string): string {
  // DOMParser documents are inert: nothing in them runs or loads.
  const parsed = new DOMParser().parseFromString(source, 'text/html')
  const headStyles = Array.from(parsed.head.querySelectorAll('style'), (style) => style.outerHTML)
  const body = DOMPurify.sanitize(headStyles.join('') + parsed.body.innerHTML, {
    // Keeps a leading <style>, which the parser would otherwise hoist out of the body.
    FORCE_BODY: true,
    RETURN_DOM: true,
    USE_PROFILES: { html: true, svg: true, svgFilters: true },
    FORBID_TAGS: FORBIDDEN_TAGS
  })
  if (!(body instanceof Element)) {
    return ''
  }
  stripNativeChatMarkupNetworkRefs(body)
  return body.innerHTML
}

const BASE_STYLES = `
:where(html){color-scheme:inherit}
:where(html,body){margin:0;background:transparent;color:var(--foreground,CanvasText)}
:where(body){padding:12px;overflow-x:auto}
:where(img,svg){max-width:100%;height:auto}
:where(pre,code){font-family:ui-monospace,Menlo,Consolas,monospace}
`

const KIND_STYLES: Record<NativeChatMarkupKind, string> = {
  html: '',
  svg: ':where(body){display:flex;justify-content:center}',
  widget: ':where(body){padding:16px}'
}

export function buildNativeChatMarkupPreviewDocument({
  source,
  kind,
  colorScheme,
  tokenCss
}: {
  source: string
  kind: NativeChatMarkupKind
  colorScheme: 'light' | 'dark'
  /** App design tokens as `--name:value` declarations, already stripped of structural characters. */
  tokenCss: string
}): string {
  const body = sanitizeNativeChatMarkup(source)
  // The CSP meta comes first so it governs everything parsed after it.
  return (
    '<!doctype html>' +
    `<html class="${colorScheme}"><head><meta charset="utf-8">` +
    `<meta http-equiv="Content-Security-Policy" content="${NATIVE_CHAT_MARKUP_PREVIEW_CSP}">` +
    `<meta name="color-scheme" content="${colorScheme}">` +
    `<style>:root{${tokenCss}}${BASE_STYLES}${NATIVE_CHAT_MARKUP_STYLE_KIT}${KIND_STYLES[kind]}</style>` +
    `<script>${NATIVE_CHAT_MARKUP_SIZE_SCRIPT}</script>` +
    `</head><body>${body}</body></html>`
  )
}
