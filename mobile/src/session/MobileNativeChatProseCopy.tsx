import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { useClipboardWriter } from '../platform/clipboard'
import { colors } from '../theme/mobile-theme'

/** Android transcripts turn text selection off: a drag over selectable text there starts a
 *  selection instead of scrolling. Long-pressing a message copies it instead. iOS keeps its
 *  range selection, which only starts on a long press. */
export const NATIVE_CHAT_TEXT_SELECTABLE = Platform.OS !== 'android'

const COPIED_MS = 1500

export function MobileNativeChatProseCopy({
  text,
  children
}: {
  text: string
  children: ReactNode
}): React.JSX.Element {
  const clipboard = useClipboardWriter()
  const [note, setNote] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    },
    []
  )
  if (NATIVE_CHAT_TEXT_SELECTABLE || !text.trim()) {
    return <>{children}</>
  }
  const copy = async (): Promise<void> => {
    try {
      await clipboard.writeText(text)
      setNote('Copied')
    } catch {
      setNote('Copy failed')
    }
    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }
    timerRef.current = setTimeout(() => setNote(null), COPIED_MS)
  }
  return (
    <Pressable
      accessibilityHint="Long-press to copy this message"
      delayLongPress={450}
      onLongPress={() => void copy()}
    >
      <View>{children}</View>
      {note ? <Text style={styles.note}>{note}</Text> : null}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  note: { color: colors.textMuted, fontSize: 12, marginTop: 2 }
})
