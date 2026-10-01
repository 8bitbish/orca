import { Text, View } from 'react-native'
import { styles } from '../mobile-markdown-styles'
import type { MobileMarkupPreviewProps } from './MobileMarkupPreview'

/** Web sibling: the page has no second content process to sandbox in, so it stays code. */
export function MobileMarkupPreview({ source, kind }: MobileMarkupPreviewProps): React.JSX.Element {
  return (
    <View style={styles.codeBlock}>
      <Text style={styles.codeLanguage}>{kind}</Text>
      <Text selectable style={styles.codeText}>
        {source}
      </Text>
    </View>
  )
}
