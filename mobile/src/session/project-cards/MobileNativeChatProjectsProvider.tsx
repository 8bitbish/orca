import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { NativeChatMessage } from '../../../../src/shared/native-chat-types'
import { MobileMarkdownRenderersContext } from '../../components/mobile-markdown-renderers'
import { useRouteHandoff } from '../../navigation/route-handoff'
import type { RpcClient } from '../../transport/rpc-client'
import type { ConnectionState } from '../../transport/types'
import { MOBILE_NATIVE_CHAT_MARKDOWN_RENDERERS } from './mobile-native-chat-markdown-renderers'
import { resolveMobileNativeChatProject } from './mobile-native-chat-project'
import {
  mobileNativeChatMentionsProject,
  MobileNativeChatProjectsContext,
  type MobileNativeChatProjects
} from './mobile-native-chat-project-context'
import { useMobileNativeChatProjectCatalog } from './use-mobile-native-chat-project-catalog'

const CLOCK_MS = 30_000

/** Gives a native chat's chips and cards the host's catalog, a send and navigation. */
export function MobileNativeChatProjectsProvider({
  client,
  hostId,
  connState,
  messages,
  send,
  canSend,
  children
}: {
  client: RpcClient | null
  hostId: string
  connState: ConnectionState
  messages: readonly NativeChatMessage[]
  send: (text: string) => Promise<boolean>
  canSend: boolean
  children: ReactNode
}): React.JSX.Element {
  const router = useRouteHandoff()
  const enabled = useMemo(() => mobileNativeChatMentionsProject(messages), [messages])
  const catalog = useMobileNativeChatProjectCatalog({ client, hostId, connState, enabled })
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!enabled) {
      return
    }
    const timer = setInterval(() => setNow(Date.now()), CLOCK_MS)
    return () => clearInterval(timer)
  }, [enabled])

  const value = useMemo<MobileNativeChatProjects>(
    () => ({
      resolve: (target) => resolveMobileNativeChatProject(target, catalog, now),
      open: (project) => {
        const name = project.workspace ?? project.name
        router.push(
          `/h/${encodeURIComponent(hostId)}/session/${encodeURIComponent(project.worktreeId)}?name=${encodeURIComponent(name)}`
        )
      },
      messages,
      send,
      canSend
    }),
    [canSend, catalog, hostId, messages, now, router, send]
  )
  return (
    <MobileNativeChatProjectsContext.Provider value={value}>
      <MobileMarkdownRenderersContext.Provider value={MOBILE_NATIVE_CHAT_MARKDOWN_RENDERERS}>
        {children}
      </MobileMarkdownRenderersContext.Provider>
    </MobileNativeChatProjectsContext.Provider>
  )
}
