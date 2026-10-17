import type { RefObject } from 'react'
import type { NativeChatMessage } from '../../../../shared/native-chat-types'
import { NativeChatClaudeSignInContext } from './native-chat-claude-sign-in'
import type { NativeChatComposerHandle } from './native-chat-composer-types'
import { NativeChatOrcaStopContext } from './native-chat-orca-stop-context'
import { useNativeChatProjectReplyChannel } from './native-chat-project-reply-context'
import { NativeChatRewindContext } from './native-chat-rewind-context'
import { NativeChatReplyScope } from './NativeChatReplyScope'

type ContextValue<T> = T extends React.Context<infer V> ? V : never

/** A structured chat transcript's contexts: rewind, Orca stop, Claude sign-in, and replies that
 *  act through the composer (which a pending prompt card replaces) or run in the workspace. */
export function NativeChatStructuredTranscriptScope(props: {
  composerRef: RefObject<NativeChatComposerHandle | null>
  canSend: boolean
  messages: readonly NativeChatMessage[]
  worktreeId: string | null | undefined
  sessionId: string | null | undefined
  rewind: ContextValue<typeof NativeChatRewindContext>
  orcaStop: ContextValue<typeof NativeChatOrcaStopContext>
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
        <NativeChatOrcaStopContext.Provider value={props.orcaStop}>
          <NativeChatClaudeSignInContext.Provider value={props.claudeSignIn}>
            {props.children}
          </NativeChatClaudeSignInContext.Provider>
        </NativeChatOrcaStopContext.Provider>
      </NativeChatRewindContext.Provider>
    </NativeChatReplyScope>
  )
}
