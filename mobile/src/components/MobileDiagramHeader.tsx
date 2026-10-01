import { useEffect, useRef, useState } from 'react'
import { Check, Code2, Copy } from 'lucide-react-native'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useClipboardWriter } from '../platform/clipboard'
import { colors, spacing, typography } from '../theme/mobile-theme'

const COPIED_RESET_MS = 1500

/** A rendered fence's label strip, as desktop's diagram card draws it: a toggle to
 *  the source and a copy of that source. */
export function MobileDiagramHeader({
  label,
  source,
  showSource,
  onToggleSource
}: {
  label: string
  source: string
  showSource: boolean
  onToggleSource: () => void
}): React.JSX.Element {
  const clipboard = useClipboardWriter()
  // Three states: a refused write must not read as copied.
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const resetRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (resetRef.current) {
        clearTimeout(resetRef.current)
      }
    },
    []
  )
  const copy = async (): Promise<void> => {
    try {
      await clipboard.writeText(source)
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }
    if (resetRef.current) {
      clearTimeout(resetRef.current)
    }
    resetRef.current = setTimeout(() => setCopyState('idle'), COPIED_RESET_MS)
  }
  return (
    <View style={styles.strip}>
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={showSource ? `Show ${label} diagram` : `Show ${label} code`}
          accessibilityState={{ selected: showSource }}
          hitSlop={8}
          onPress={onToggleSource}
          style={[styles.action, showSource ? styles.actionOn : null]}
        >
          <Code2 size={13} color={colors.textSecondary} />
          <Text style={styles.actionText}>Code</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Copy code"
          hitSlop={8}
          onPress={() => void copy()}
          style={styles.action}
        >
          {copyState === 'copied' ? (
            <Check size={13} color={colors.statusGreen} />
          ) : (
            <Copy size={13} color={colors.textSecondary} />
          )}
          <Text style={styles.actionText}>
            {copyState === 'copied' ? 'Copied' : copyState === 'failed' ? 'Copy failed' : 'Copy'}
          </Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    minHeight: 30,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
    backgroundColor: colors.bgPanel
  },
  label: {
    flexShrink: 1,
    color: colors.textSecondary,
    fontSize: 11,
    fontFamily: typography.monoFamily
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4
  },
  actionOn: { backgroundColor: colors.bgRaised },
  actionText: { color: colors.textSecondary, fontSize: 11 }
})
