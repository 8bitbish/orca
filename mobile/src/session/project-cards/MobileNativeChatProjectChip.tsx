import { useContext } from 'react'
import { StyleSheet, Text } from 'react-native'
import { parseNativeChatWorktreeHref } from '../../../../src/shared/native-chat-project-target'
import { agentStateDotColor } from '../../components/AgentStateDot'
import { colors } from '../../theme/mobile-theme'
import { MOBILE_NATIVE_CHAT_PROJECT_STATUS_LABEL } from './mobile-native-chat-project'
import { MobileNativeChatProjectsContext } from './mobile-native-chat-project-context'
import { mobileNativeChatProjectStatusDot } from './mobile-native-chat-project-status-dot'

/**
 * An `[name](orca-worktree:repo/workspace)` link in a reply, drawn inline as a pill
 * with the project's name, workspace and status dot that opens the workspace. A
 * target the host does not list reads as the link's plain text.
 */
export function MobileNativeChatProjectChip({
  href,
  label
}: {
  href: string
  label: string
}): React.JSX.Element {
  const projects = useContext(MobileNativeChatProjectsContext)
  const target = parseNativeChatWorktreeHref(href)
  const project = target && projects ? projects.resolve(target) : null
  if (!project || !projects) {
    return <Text>{label}</Text>
  }
  const status = MOBILE_NATIVE_CHAT_PROJECT_STATUS_LABEL[project.status]
  const title = project.workspace ? `${project.name} · ${project.workspace}` : project.name
  return (
    <Text
      accessibilityRole="link"
      accessibilityLabel={`Open ${title}, ${status}`}
      suppressHighlighting
      onPress={() => projects.open(project)}
      style={styles.chip}
    >
      {' '}
      <Text style={styles.name}>{project.name}</Text>
      {project.workspace ? <Text style={styles.workspace}> {project.workspace}</Text> : null}
      <Text style={{ color: agentStateDotColor(mobileNativeChatProjectStatusDot(project.status)) }}>
        {' ●'}
      </Text>
      {' '}
    </Text>
  )
}

const styles = StyleSheet.create({
  chip: { backgroundColor: colors.bgRaised, color: colors.textPrimary },
  name: { fontWeight: '600' },
  workspace: { color: colors.textSecondary }
})
