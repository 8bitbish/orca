import { memo, useMemo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { WebView, type WebViewMessageEvent } from 'react-native-webview'
import {
  clampNativeChatMarkupHeight,
  NATIVE_CHAT_MARKUP_MAX_HEIGHT_PX,
  NATIVE_CHAT_MARKUP_SIZE_MESSAGE,
  type NativeChatMarkupKind
} from '../../../../src/shared/native-chat-markup-preview-policy'
import { colors, radii, spacing, typography } from '../../theme/mobile-theme'
import { buildMobileMarkupPreviewDocument } from './mobile-markup-preview-document'

export type MobileMarkupPreviewProps = { source: string; kind: NativeChatMarkupKind }

const INITIAL_HEIGHT_PX = 160

function previewHeight(event: WebViewMessageEvent): number | null {
  try {
    const data: unknown = JSON.parse(event.nativeEvent.data)
    if (
      typeof data === 'object' &&
      data !== null &&
      'type' in data &&
      data.type === NATIVE_CHAT_MARKUP_SIZE_MESSAGE &&
      'height' in data &&
      typeof data.height === 'number' &&
      Number.isFinite(data.height)
    ) {
      return clampNativeChatMarkupHeight(data.height)
    }
  } catch {
    // Not ours; the page cannot run script, but the bridge is reachable in principle.
  }
  return null
}

/** A reply's ```html / ```svg / ```widget fence, drawn statically: the page's only
 *  script is the hash-pinned sanitizer, and it never navigates or loads anything. */
export const MobileMarkupPreview = memo(function MobileMarkupPreview({
  source,
  kind
}: MobileMarkupPreviewProps) {
  const [height, setHeight] = useState(INITIAL_HEIGHT_PX)
  const html = useMemo(() => buildMobileMarkupPreviewDocument(source, kind), [source, kind])

  return (
    <View style={styles.frame}>
      <View style={styles.label}>
        <Text style={styles.labelText}>{kind}</Text>
      </View>
      <WebView
        style={[styles.webview, { height }]}
        originWhitelist={['about:blank']}
        source={{ html }}
        scrollEnabled={height >= NATIVE_CHAT_MARKUP_MAX_HEIGHT_PX}
        nestedScrollEnabled
        onShouldStartLoadWithRequest={(request) =>
          request.url === 'about:blank' || request.url.startsWith('data:')
        }
        setSupportMultipleWindows={false}
        javaScriptCanOpenWindowsAutomatically={false}
        allowFileAccess={false}
        allowFileAccessFromFileURLs={false}
        allowUniversalAccessFromFileURLs={false}
        mixedContentMode="never"
        incognito
        cacheEnabled={false}
        allowsLinkPreview={false}
        mediaPlaybackRequiresUserAction
        onMessage={(event) => {
          const next = previewHeight(event)
          if (next !== null) {
            setHeight(next)
          }
        }}
      />
    </View>
  )
})

const styles = StyleSheet.create({
  frame: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    borderRadius: radii.row,
    marginBottom: spacing.sm,
    overflow: 'hidden',
    backgroundColor: colors.bgRaised
  },
  label: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
    backgroundColor: colors.bgPanel
  },
  labelText: { color: colors.textSecondary, fontSize: 11, fontFamily: typography.monoFamily },
  webview: { backgroundColor: colors.bgRaised }
})
