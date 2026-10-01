import { useContext } from 'react'
import { Text } from 'react-native'
import { parseNativeChatWorktreeHref } from '../../../../src/shared/native-chat-project-target'
import { agentStateDotColor } from '../../components/AgentStateDot'
import { MobileInlinePill } from '../../components/MobileInlinePill'
import { MarkdownProseSizeContext } from '../../components/mobile-markdown-text'
import { MOBILE_NATIVE_CHAT_PROJECT_STATUS_LABEL } from './mobile-native-chat-project'
import { MobileNativeChatProjectsContext } from './mobile-native-chat-project-context'
import { mobileNativeChatProjectStatusDot } from './mobile-native-chat-project-status-dot'
import { MobileNativeChatProjectIcon } from './MobileNativeChatProjectIcon'

/**
 * An `[name](orca-worktree:repo/workspace)` link in a reply, drawn inline as a pill with the
 * project's icon, name, workspace and status dot that opens the workspace. A target the host
 * does not list reads as the link's plain text.
 */
export function MobileNativeChatProjectChip({
  href,
  label
}: {
  href: string
  label: string
}): React.JSX.Element {
  const projects = useContext(MobileNativeChatProjectsContext)
  const proseSize = useContext(MarkdownProseSizeContext)
  const target = parseNativeChatWorktreeHref(href)
  const project = target && projects ? projects.resolve(target) : null
  if (!project || !projects) {
    return <Text>{label}</Text>
  }
  const status = MOBILE_NATIVE_CHAT_PROJECT_STATUS_LABEL[project.status]
  const title = project.workspace ? `${project.name} · ${project.workspace}` : project.name
  return (
    <MobileInlinePill
      label={project.name}
      detail={project.workspace}
      leading={<MobileNativeChatProjectIcon repo={project.repo} size={Math.round(proseSize)} />}
      dotColor={agentStateDotColor(mobileNativeChatProjectStatusDot(project.status))}
      accessibilityLabel={`Open ${title}, ${status}`}
      onPress={() => projects.open(project)}
    />
  )
}
