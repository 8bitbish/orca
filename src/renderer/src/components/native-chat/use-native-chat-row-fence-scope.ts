import { useMemo } from 'react'
import { agentJournalItemSubagentId } from '../../../../shared/agent-session-journal-producer'
import type { NativeChatMessage } from '../../../../shared/native-chat-types'
import { nativeChatFences, type NativeChatFencePreviewScope } from './native-chat-fence-preview'

/** How a row's fences render: replies preview html/svg fences, every row holds back a fence still
 *  streaming, and Run buttons belong to the agent's own replies, never a subagent's aside. */
export function useNativeChatRowFenceScope(
  message: NativeChatMessage,
  markdown: string
): NativeChatFencePreviewScope {
  const shellRuns = message.role === 'assistant' && agentJournalItemSubagentId(message) === null
  return useMemo(() => {
    const fences = nativeChatFences(markdown)
    return {
      markupPreviews: message.role === 'assistant',
      openFenceBody: fences.open,
      messageId: message.id,
      shellRuns,
      fenceBodies: fences.closed
    }
  }, [markdown, message.id, message.role, shellRuns])
}
