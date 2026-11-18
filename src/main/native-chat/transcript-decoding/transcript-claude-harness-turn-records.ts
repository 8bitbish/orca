import type { NativeChatBlock } from '../../../shared/native-chat/native-chat-types'
import { asRecord } from '../../ai-vault/parsing/session-record-fields'
import { isHarnessTurnOpenerText } from '../../../shared/agent-session/journal/harness-injected-user-turns'

/** The harness's synthetic "No response requested." stand-in reply to a meta turn. */
export function isClaudeNoResponseFiller(message: Record<string, unknown> | null): boolean {
  if (message?.model !== '<synthetic>') {
    return false
  }
  const content = message.content
  const text =
    typeof content === 'string'
      ? content
      : Array.isArray(content) && content.length === 1
        ? asRecord(content[0])?.text
        : undefined
  return typeof text === 'string' && text.trim() === 'No response requested.'
}

/** A meta user record the agent answers (task notification, slash command, peer hand-back). */
export function isHarnessTurnOpenerRecord(blocks: NativeChatBlock[]): boolean {
  const first = blocks[0]
  return (
    first?.type === 'text' &&
    blocks.every((block) => block.type === 'text') &&
    isHarnessTurnOpenerText(first.text)
  )
}
