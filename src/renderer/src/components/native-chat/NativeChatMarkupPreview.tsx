import { useEffect, useMemo, useRef, useState } from 'react'
import { translate } from '@/i18n/i18n'
import { useNativeChatThemeSnapshot } from './use-native-chat-theme-snapshot'
import {
  buildNativeChatMarkupPreviewDocument,
  NATIVE_CHAT_MARKUP_PREVIEW_SANDBOX,
  NATIVE_CHAT_MARKUP_SIZE_MESSAGE,
  type NativeChatMarkupKind
} from './native-chat-markup-preview-document'

const MIN_HEIGHT_PX = 48
/** Taller content scrolls inside the frame instead of growing the transcript. */
export const NATIVE_CHAT_MARKUP_MAX_HEIGHT_PX = 560
const INITIAL_HEIGHT_PX = 160
const MAX_REMEMBERED_HEIGHTS = 64

// Windowing unmounts rows; a remounted preview starts at its last measured height
// instead of jumping from the placeholder once the frame reports again.
const rememberedHeights = new Map<string, number>()

function rememberHeight(key: string, height: number): void {
  rememberedHeights.delete(key)
  rememberedHeights.set(key, height)
  if (rememberedHeights.size > MAX_REMEMBERED_HEIGHTS) {
    const oldest = rememberedHeights.keys().next().value
    if (oldest !== undefined) {
      rememberedHeights.delete(oldest)
    }
  }
}

export function clampNativeChatMarkupHeight(height: number): number {
  return Math.min(NATIVE_CHAT_MARKUP_MAX_HEIGHT_PX, Math.max(MIN_HEIGHT_PX, Math.ceil(height)))
}

function markupPreviewTitle(kind: NativeChatMarkupKind): string {
  if (kind === 'svg') {
    return translate('components.native-chat.diagram.svgPreviewTitle', 'SVG preview')
  }
  if (kind === 'widget') {
    return translate('components.native-chat.diagram.widgetPreviewTitle', 'Widget preview')
  }
  return translate('components.native-chat.diagram.htmlPreviewTitle', 'HTML preview')
}

/** Agent-authored HTML, SVG or widget markup, live in a sandboxed frame sized to its content. */
export function NativeChatMarkupPreview({
  source,
  kind
}: {
  source: string
  kind: NativeChatMarkupKind
}): React.JSX.Element {
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const theme = useNativeChatThemeSnapshot()
  const { colorScheme } = theme
  const heightKey = `${kind}:${source}`
  const [height, setHeight] = useState(() => rememberedHeights.get(heightKey) ?? INITIAL_HEIGHT_PX)
  const srcDoc = useMemo(
    () =>
      buildNativeChatMarkupPreviewDocument({
        source,
        kind,
        colorScheme: theme.colorScheme,
        tokenCss: theme.tokenCss
      }),
    [kind, source, theme]
  )

  useEffect(() => {
    const onMessage = (event: MessageEvent): void => {
      // Only this frame's own window, and only the one message shape it sends.
      if (event.source === null || event.source !== iframeRef.current?.contentWindow) {
        return
      }
      const data: unknown = event.data
      if (
        typeof data !== 'object' ||
        data === null ||
        !('type' in data) ||
        data.type !== NATIVE_CHAT_MARKUP_SIZE_MESSAGE ||
        !('height' in data) ||
        typeof data.height !== 'number' ||
        !Number.isFinite(data.height)
      ) {
        return
      }
      const next = clampNativeChatMarkupHeight(data.height)
      rememberHeight(heightKey, next)
      setHeight(next)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [heightKey])

  return (
    <iframe
      ref={iframeRef}
      title={markupPreviewTitle(kind)}
      // SECURITY: never add allow-same-origin; see native-chat-markup-preview-document.ts.
      sandbox={NATIVE_CHAT_MARKUP_PREVIEW_SANDBOX}
      referrerPolicy="no-referrer"
      srcDoc={srcDoc}
      data-native-chat-markup-preview={kind}
      className="block w-full border-0"
      // Why: a color-scheme mismatch with the frame document paints an opaque canvas.
      style={{ height: `${height}px`, colorScheme }}
    />
  )
}
