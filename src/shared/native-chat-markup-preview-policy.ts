// What a chat reply's ```html / ```svg / ```widget preview may contain, shared by the
// desktop iframe and the mobile WebView so both strip the same things. Typed
// structurally so it builds without the DOM lib; callers pass real DOM elements.

export type NativeChatMarkupKind = 'html' | 'svg' | 'widget'

export const NATIVE_CHAT_MARKUP_SIZE_MESSAGE = 'orca-native-chat-markup-size'

const MIN_HEIGHT_PX = 48
/** Taller content scrolls inside the frame instead of growing the transcript. */
export const NATIVE_CHAT_MARKUP_MAX_HEIGHT_PX = 560

export function clampNativeChatMarkupHeight(height: number): number {
  return Math.min(NATIVE_CHAT_MARKUP_MAX_HEIGHT_PX, Math.max(MIN_HEIGHT_PX, Math.ceil(height)))
}

/** The preview CSP; `scriptSrc` is the only part a platform chooses. */
export function nativeChatMarkupPreviewCsp(scriptSrc: string): string {
  return [
    "default-src 'none'",
    `script-src ${scriptSrc}`,
    "style-src 'unsafe-inline'",
    'img-src data:',
    'font-src data:',
    "base-uri 'none'",
    "form-action 'none'"
  ].join('; ')
}

export const NATIVE_CHAT_MARKUP_FORBIDDEN_TAGS: readonly string[] = [
  'base',
  'embed',
  'form',
  'frame',
  'frameset',
  'iframe',
  // Form controls outlive a stripped <form> as inert boxes; a static reply has no use for them.
  'input',
  'link',
  'meta',
  'noscript',
  'object',
  'portal',
  'script',
  'select',
  'textarea'
]

type MarkupElement = {
  readonly localName: string
  getAttribute(name: string): string | null
  removeAttribute(name: string): void
  remove(): void
}

type MarkupRoot = {
  querySelectorAll(selectors: string): ArrayLike<MarkupElement>
}

const LINK_ATTRIBUTES = ['href', 'xlink:href']
const MEDIA_SELECTOR = 'img, image, video, audio, source, track, input[type="image"]'
const MEDIA_SOURCE_ATTRIBUTES = ['src', 'href', 'xlink:href', 'poster']

function isInlineData(value: string): boolean {
  return value.trim().toLowerCase().startsWith('data:')
}

/** Drops what the CSP would only block: outbound link targets, and media whose
 *  source is not inline data, which would otherwise paint as a broken image. */
export function stripNativeChatMarkupNetworkRefs(root: MarkupRoot): void {
  for (const anchor of Array.from(root.querySelectorAll('a'))) {
    for (const attribute of LINK_ATTRIBUTES) {
      const value = anchor.getAttribute(attribute)
      if (value !== null && !value.trim().startsWith('#')) {
        anchor.removeAttribute(attribute)
      }
    }
  }
  for (const element of Array.from(root.querySelectorAll('[srcset]'))) {
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

export const NATIVE_CHAT_MARKUP_BASE_STYLES = `
:where(html){color-scheme:inherit}
:where(html,body){margin:0;background:transparent;color:var(--foreground,CanvasText)}
:where(body){padding:12px;overflow-x:auto}
:where(img,svg){max-width:100%;height:auto}
:where(pre,code){font-family:ui-monospace,Menlo,Consolas,monospace}
`

export const NATIVE_CHAT_MARKUP_KIND_STYLES: Record<NativeChatMarkupKind, string> = {
  html: '',
  svg: ':where(body){display:flex;justify-content:center}',
  widget: ':where(body){padding:16px}'
}
