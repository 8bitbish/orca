import type { ComponentProps, RefObject } from 'react'
import type { NativeChatMessage } from '../../../../shared/native-chat/native-chat-types'
import type { NativeChatComposerHandle } from './native-chat-composer-types'
import { useNativeChatProjectReplyChannel } from './native-chat-project-reply-context'
import { NativeChatReplyScope } from './NativeChatReplyScope'
import { NativeChatRowActionsProvider } from './NativeChatRowActionsProvider'
import { NativeChatSignInContext } from './native-chat-sign-in'
import { NativeChatUsageLimitActionsProvider } from './NativeChatUsageLimitActions'

type RowActions = ComponentProps<typeof NativeChatRowActionsProvider>
type UsageLimit = ComponentProps<typeof NativeChatUsageLimitActionsProvider>

/** A structured chat transcript's contexts: row actions, usage-limit actions, sign-in, and
 *  replies that act through the composer (which a pending prompt card replaces) or run in the
 *  workspace. */
export function NativeChatStructuredTranscriptScope(props: {
  composerRef: RefObject<NativeChatComposerHandle | null>
  canSend: boolean
  pane: RowActions['pane'] & UsageLimit['pane']
  chat: RowActions['chat'] & UsageLimit['recovery'] & { messages: readonly NativeChatMessage[] }
  directory: UsageLimit['directory']
  view: UsageLimit['view']
  signIn: React.ContextType<typeof NativeChatSignInContext>
  children: React.ReactNode
}): React.JSX.Element {
  const { pane, chat } = props
  const projectReplies = useNativeChatProjectReplyChannel(
    props.composerRef,
    props.canSend,
    chat.messages
  )
  return (
    <NativeChatReplyScope
      projectReplies={projectReplies}
      worktreeId={props.directory?.worktreeId}
      sessionId={pane.sessionId}
    >
      <NativeChatRowActionsProvider pane={pane} chat={chat}>
        <NativeChatUsageLimitActionsProvider
          recovery={chat}
          pane={pane}
          directory={props.directory}
          messages={chat.messages}
          view={props.view}
        >
          <NativeChatSignInContext.Provider value={props.signIn}>
            {props.children}
          </NativeChatSignInContext.Provider>
        </NativeChatUsageLimitActionsProvider>
      </NativeChatRowActionsProvider>
    </NativeChatReplyScope>
  )
}
