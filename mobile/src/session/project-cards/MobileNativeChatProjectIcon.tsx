import { StyleSheet, Text, View } from 'react-native'
import { MobileRepoIcon } from '../../components/MobileRepoIcon'
import { colors } from '../../theme/mobile-theme'
import { repoColor } from '../../worktree/repo-color'
import type { MobileNativeChatProjectRepo } from './mobile-native-chat-project'

/** The reply's own `icon`, then the repo icon the host screen shows, then a monogram. */
export function MobileNativeChatProjectIcon({
  repo,
  payloadIcon,
  size,
  round = false
}: {
  repo: MobileNativeChatProjectRepo
  payloadIcon?: string
  size: number
  /** A circle, for the rounded end of an inline pill. */
  round?: boolean
}): React.JSX.Element {
  const box = { width: size, height: size, borderRadius: round ? size / 2 : size / 4 }
  if (payloadIcon) {
    return (
      <View style={[styles.box, box]}>
        <Text style={{ fontSize: size * 0.7 }}>{payloadIcon}</Text>
      </View>
    )
  }
  if (repo.repoIcon) {
    return (
      <View style={[styles.box, styles.tile, box]}>
        <MobileRepoIcon repoIcon={repo.repoIcon} size={size * 0.7} color={colors.textPrimary} />
      </View>
    )
  }
  const letter = Array.from(repo.displayName.trim()).find((char) => /[\p{L}\p{N}]/u.test(char))
  return (
    <View style={[styles.box, box, { backgroundColor: repoColor(repo.displayName) }]}>
      <Text style={[styles.monogram, { fontSize: size * 0.55 }]}>
        {letter ? letter.toLocaleUpperCase() : '?'}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  tile: { backgroundColor: colors.bgPanel },
  monogram: { color: colors.onAccent, fontWeight: '700' }
})
