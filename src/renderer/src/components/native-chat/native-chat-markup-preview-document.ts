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
import {
  NATIVE_CHAT_MARKUP_BASE_STYLES,
  NATIVE_CHAT_MARKUP_FORBIDDEN_TAGS,
  NATIVE_CHAT_MARKUP_KIND_STYLES,
  NATIVE_CHAT_MARKUP_SIZE_MESSAGE,
  nativeChatMarkupPreviewCsp,
  stripNativeChatMarkupNetworkRefs,
  type NativeChatMarkupKind
} from '../../../../shared/native-chat-markup-preview-policy'
import { NATIVE_CHAT_MARKUP_STYLE_KIT } from './native-chat-markup-style-kit'

export {
  NATIVE_CHAT_MARKUP_SIZE_MESSAGE,
  stripNativeChatMarkupNetworkRefs,
  type NativeChatMarkupKind
}

export const NATIVE_CHAT_MARKUP_SIZE_SCRIPT = `(function(){var post=function(){var body=document.body;if(body){parent.postMessage({type:'${NATIVE_CHAT_MARKUP_SIZE_MESSAGE}',height:Math.ceil(Math.max(body.scrollHeight,body.getBoundingClientRect().height))},'*')}};document.addEventListener('DOMContentLoaded',function(){post();new ResizeObserver(post).observe(document.body)});addEventListener('load',post)})()`

/** SHA-256 of the sizing script; a test recomputes it so the two cannot drift. */
export const NATIVE_CHAT_MARKUP_SIZE_SCRIPT_HASH =
  'sha256-2vFGQ8iSTd6jbgxLE9+NrcfWSK8oyxhDKC59Lt4Cy/U='

export const NATIVE_CHAT_MARKUP_PREVIEW_CSP = nativeChatMarkupPreviewCsp(
  `'${NATIVE_CHAT_MARKUP_SIZE_SCRIPT_HASH}'`
)

/** `sandbox` for the preview frame. SECURITY: never add allow-same-origin. */
export const NATIVE_CHAT_MARKUP_PREVIEW_SANDBOX = 'allow-scripts'

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
    FORBID_TAGS: [...NATIVE_CHAT_MARKUP_FORBIDDEN_TAGS]
  })
  if (!(body instanceof Element)) {
    return ''
  }
  stripNativeChatMarkupNetworkRefs(body)
  return body.innerHTML
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
    `<style>:root{${tokenCss}}${NATIVE_CHAT_MARKUP_BASE_STYLES}${NATIVE_CHAT_MARKUP_STYLE_KIT}${NATIVE_CHAT_MARKUP_KIND_STYLES[kind]}</style>` +
    `<script>${NATIVE_CHAT_MARKUP_SIZE_SCRIPT}</script>` +
    `</head><body>${body}</body></html>`
  )
}
