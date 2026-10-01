// Runs inside the chat markup preview WebView, bundled by
// scripts/build-markup-preview-engine.mjs and pinned by its hash in the page CSP, so
// it is the only script that page can run. It reads the agent markup from an inert
// JSON block, sanitizes it the way the desktop frame does, and reports its height.
// Never imported by the app itself.

import DOMPurify from 'dompurify'
import {
  NATIVE_CHAT_MARKUP_FORBIDDEN_TAGS,
  NATIVE_CHAT_MARKUP_SIZE_MESSAGE,
  stripNativeChatMarkupNetworkRefs
} from '../../../../src/shared/native-chat-markup-preview-policy'

type NativeBridge = { postMessage(message: string): void }

function nativeBridge(): NativeBridge | null {
  const bridge: unknown = Reflect.get(window, 'ReactNativeWebView')
  if (typeof bridge !== 'object' || bridge === null || !('postMessage' in bridge)) {
    return null
  }
  const { postMessage } = bridge
  return typeof postMessage === 'function'
    ? { postMessage: (message) => void postMessage.call(bridge, message) }
    : null
}

function sanitize(source: string): string {
  // An engine DOMPurify cannot run in gets nothing rather than the raw markup.
  if (!DOMPurify.isSupported) {
    return ''
  }
  const parsed = new DOMParser().parseFromString(source, 'text/html')
  const headStyles = Array.from(parsed.head.querySelectorAll('style'), (style) => style.outerHTML)
  const body = DOMPurify.sanitize(headStyles.join('') + parsed.body.innerHTML, {
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

function readSource(): string {
  const block = document.getElementById('orca-markup-source')
  const payload: unknown = JSON.parse(block?.textContent ?? 'null')
  return typeof payload === 'object' && payload !== null && 'source' in payload
    ? String(payload.source)
    : ''
}

function render(): void {
  const bridge = nativeBridge()
  const post = (): void => {
    const height = Math.ceil(
      Math.max(document.body.scrollHeight, document.body.getBoundingClientRect().height)
    )
    bridge?.postMessage(JSON.stringify({ type: NATIVE_CHAT_MARKUP_SIZE_MESSAGE, height }))
  }
  try {
    document.body.innerHTML = sanitize(readSource())
  } catch {
    document.body.textContent = ''
  }
  post()
  new ResizeObserver(post).observe(document.body)
  addEventListener('load', post)
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', render)
} else {
  render()
}
