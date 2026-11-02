import type { ComponentProps, RefObject } from 'react'
import type { NativeChatMessage } from '../../../../shared/native-chat/native-chat-types'
import { NativeChatClaudeSignInContext } from './native-chat-claude-sign-in'
import type { NativeChatComposerHandle } from './native-chat-composer-types'
import { useNativeChatProjectReplyChannel } from './native-chat-project-reply-context'
import { NativeChatRewindContext } from './native-chat-rewind-context'
import { NativeChatReplyScope } from './NativeChatReplyScope'
import { NativeChatUsageLimitActionsProvider } from './NativeChatUsageLimitActions'

type ContextValue<T> = T extends React.Context<infer V> ? V : never

/** A structured chat transcript's contexts: rewind, usage-limit actions and Orca stop, Claude
 *  sign-in, and replies that act through the composer (which a pending prompt card replaces) or
 *  run in the workspace. */
export function NativeChatStructuredTranscriptScope(props: {
  composerRef: RefObject<NativeChatComposerHandle | null>
  canSend: boolean
  messages: readonly NativeChatMessage[]
  worktreeId: string | null | undefined
  sessionId: string | null | undefined
  rewind: ContextValue<typeof NativeChatRewindContext>
  usageLimit: Omit<
    ComponentProps<typeof NativeChatUsageLimitActionsProvider>,
    'messages' | 'children'
  >
  claudeSignIn: ContextValue<typeof NativeChatClaudeSignInContext>
  children: React.ReactNode
}): React.JSX.Element {
  const projectReplies = useNativeChatProjectReplyChannel(
    props.composerRef,
    props.canSend,
    props.messages
  )
  return (
    <NativeChatReplyScope
      projectReplies={projectReplies}
      worktreeId={props.worktreeId}
      sessionId={props.sessionId}
    >
      <NativeChatRewindContext.Provider value={props.rewind}>
        <NativeChatUsageLimitActionsProvider {...props.usageLimit} messages={props.messages}>
          <NativeChatClaudeSignInContext.Provider value={props.claudeSignIn}>
            {props.children}
          </NativeChatClaudeSignInContext.Provider>
        </NativeChatUsageLimitActionsProvider>
      </NativeChatRewindContext.Provider>
    </NativeChatReplyScope>
  )
}
