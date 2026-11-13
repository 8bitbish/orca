import {
  memo,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View, type HostInstance } from 'react-native'
import { colors, radii, spacing, typography, pressedStyle } from '../../theme/mobile-theme'
import { useMobileColorScheme } from '../../theme/use-mobile-color-scheme'
import { themedStyleSheet } from '../../theme/themed-styles'
import { readableMermaidFlowchartSvg } from '../../../../src/shared/mermaid-flowchart-contrast'
import {
  readSvgIntrinsicSize,
  svgMarkupDataUri
} from '../../../../src/shared/file-preview/svg-document'
import { useMobileTranslation } from '../../i18n/use-mobile-translation'
import { MobileNativeChatImageViewer } from '../../session/native-chat/visual/MobileNativeChatImageViewer'
import { MobileDiagramHeader } from '../MobileDiagramHeader'
import { mermaidDiagramConfig } from './mermaid-diagram-config'
import { loadPageMermaid } from './mermaid-page-engine'

/** Rendered SVG by color scheme and source, newest last. The chat list unmounts rows scrolled away and keeps their
 *  measured height as space; a remounted diagram that waited on mermaid drew short first, and the
 *  pinned end jumped by the difference and back. */
const renderedSvg = new Map<string, { id: string; svg: string }>()
const RENDERED_SVG_KEPT = 64

function rememberSvg(key: string, id: string, svg: string): void {
  renderedSvg.delete(key)
  renderedSvg.set(key, { id, svg })
  const oldest = renderedSvg.keys().next()
  if (renderedSvg.size > RENDERED_SVG_KEPT && !oldest.done) {
    renderedSvg.delete(oldest.value)
  }
}

// An image is an XML document: re-serialize the parsed drawing so HTML-only output like <br> and &nbsp; still loads.
function serializedDrawing(host: HTMLElement, readable: string): string {
  const drawing = host.querySelector('svg')
  return drawing ? new XMLSerializer().serializeToString(drawing) : readable
}

export type MermaidDiagramProps = {
  source: string
  base: number
}

// Deferred pre-bundled engine stays unevaluated without diagrams; one artifact avoids 103 scripts against 256-asset shell cap (ruling 28).
// No separate sandbox process: mermaid strict mode sanitizes serialized SVG via DOMPurify before insertion; hostile fixtures run on both engines in mobile-web-app-mermaid-render.test.mjs.
// Source is a JS string argument, never inline-script interpolation.
export const MermaidDiagram = memo(function MermaidDiagram({ source, base }: MermaidDiagramProps) {
  const colorScheme = useMobileColorScheme()
  const t = useMobileTranslation()
  const renderKey = `${colorScheme}\n${source}`
  const hostRef = useRef<HostInstance>(null)
  // Remember failing source, not flag, so next source need not clear failure through effect.
  const [failedSource, setFailedSource] = useState<string | null>(null)
  // Sanitize React id for CSS identifier because mermaid embeds #id rules; do not assume React’s current _R_0_ spelling.
  const suffix = useId().replace(/[^\w-]/g, '')
  const id = `orca-mermaid-${suffix}`
  const failed = failedSource === source
  const [showSource, setShowSource] = useState(false)
  // The drawn diagram, kept by source so a new source never expands a stale drawing.
  const [drawn, setDrawn] = useState<{ source: string; svg: string } | null>(null)
  const [expanded, setExpanded] = useState(false)
  const drawnSvg = drawn?.source === source ? drawn.svg : null

  // Before layout, so a remounted diagram is measured at its drawn size, and mermaid isn't run again.
  useLayoutEffect(() => {
    const host = hostRef.current
    const kept = renderedSvg.get(renderKey)
    if (host instanceof HTMLElement && kept) {
      // Already sanitized when mermaid rendered it; only its stylesheet's `#<id>` is retargeted.
      const readable = kept.svg.replaceAll(kept.id, id)
      host.innerHTML = readable
      setDrawn({ source, svg: serializedDrawing(host, readable) })
    }
  }, [id, renderKey, source])

  useEffect(() => {
    // react-native-web renders View as a div and forwards the ref to it.
    const host = hostRef.current
    if (!(host instanceof HTMLElement) || renderedSvg.has(renderKey)) {
      return
    }
    let disposed = false
    void (async () => {
      try {
        const mermaid = await loadPageMermaid()
        mermaid.initialize(mermaidDiagramConfig(colorScheme))
        const { svg } = await mermaid.render(id, source)
        if (disposed) {
          return
        }
        // Only mermaid sanitizes its serialization; strict mode already made returned SVG safe to parse.
        const readable = readableMermaidFlowchartSvg(svg, colors.textPrimary, colors.bgRaised)
        host.innerHTML = readable
        rememberSvg(renderKey, id, readable)
        setDrawn({ source, svg: serializedDrawing(host, readable) })
      } catch {
        if (!disposed) {
          setFailedSource(source)
        }
      }
    })()
    return () => {
      disposed = true
      // React owns container, not mermaid contents; clear prior diagram on source change.
      host.replaceChildren()
    }
  }, [colorScheme, id, renderKey, source])

  if (failed) {
    return (
      <MermaidFrame>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.fallbackScroll}
          testID="mermaid-diagram-source"
        >
          <Text style={[styles.fallbackText, { fontSize: base - 1 }]}>{source}</Text>
        </ScrollView>
      </MermaidFrame>
    )
  }

  return (
    <View style={styles.frame} testID="mermaid-diagram">
      <MobileDiagramHeader
        label="mermaid"
        source={source}
        showSource={showSource}
        onToggleSource={() => setShowSource(!showSource)}
      />
      {showSource ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.fallbackScroll}>
          <Text selectable style={[styles.fallbackText, { fontSize: base - 1 }]}>
            {source}
          </Text>
        </ScrollView>
      ) : null}
      {/* The shared header has no expand button, so the drawing itself is the expand control. */}
      <Pressable
        style={({ pressed }) => pressed && pressedStyle}
        accessible={drawnSvg !== null}
        accessibilityRole="button"
        accessibilityLabel={t('components.mermaidDiagram.expand', 'Expand diagram')}
        disabled={!drawnSvg}
        onPress={() => setExpanded(true)}
      >
        {/* Hidden, not unmounted: the render effect owns this element's contents. */}
        <View ref={hostRef} style={showSource ? styles.hidden : styles.host} />
      </Pressable>
      {expanded && drawnSvg ? (
        <ExpandedDiagram svg={drawnSvg} onClose={() => setExpanded(false)} />
      ) : null}
    </View>
  )
})

function ExpandedDiagram({ svg, onClose }: { svg: string; onClose: () => void }) {
  const t = useMobileTranslation()
  // An <img> never runs the markup, and the viewer redraws the vector at every zoom.
  const uri = useMemo(() => svgMarkupDataUri(svg), [svg])
  const size = useMemo(() => readSvgIntrinsicSize(svg), [svg])
  return (
    <MobileNativeChatImageViewer
      uri={uri}
      size={size}
      upscale
      label={t('components.mermaidDiagram.label', 'Mermaid diagram')}
      onClose={onClose}
    />
  )
}

/** The frame and label, so a diagram and its fallback sit in the same box. */
function MermaidFrame({ children }: { children: ReactNode }) {
  useMobileColorScheme()
  return (
    <View style={styles.frame} testID="mermaid-diagram">
      <View style={styles.label}>
        <Text style={styles.labelText}>mermaid</Text>
      </View>
      {children}
    </View>
  )
}

// No rule reaches the SVG: mermaid emits it with `width="100%"` and its own natural `max-width`.
const styles = themedStyleSheet(() => ({
  frame: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    borderRadius: radii.surface,
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
  labelText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontFamily: typography.monoFamily
  },
  host: { padding: spacing.sm },
  hidden: { display: 'none' },
  fallbackScroll: { padding: spacing.sm },
  fallbackText: { color: colors.textPrimary, fontFamily: typography.monoFamily }
}))
