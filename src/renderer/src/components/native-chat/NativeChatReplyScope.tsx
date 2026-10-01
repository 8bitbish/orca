import { useMemo } from 'react'
import {
  NativeChatProjectReplyContext,
  type NativeChatProjectReplyChannel
} from './native-chat-project-reply-context'
import { NativeChatShellRunContext } from './native-chat-shell-run-workspace'

/** What a transcript's replies can act through: card replies via the composer, and
 *  Run buttons in the chat's workspace. */
export function NativeChatReplyScope({
  projectReplies,
  worktreeId,
  sessionId,
  children
}: {
  projectReplies: NativeChatProjectReplyChannel
  worktreeId: string | null | undefined
  sessionId: string | null | undefined
  children: React.ReactNode
}): React.JSX.Element {
  const shellRuns = useMemo(
    () => ({ worktreeId: worktreeId ?? null, sessionId: sessionId ?? null }),
    [sessionId, worktreeId]
  )
  return (
    <NativeChatProjectReplyContext.Provider value={projectReplies}>
      <NativeChatShellRunContext.Provider value={shellRuns}>
        {children}
      </NativeChatShellRunContext.Provider>
    </NativeChatProjectReplyContext.Provider>
  )
}
