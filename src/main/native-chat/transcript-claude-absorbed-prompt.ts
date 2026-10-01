// Claude Code absorbs a prompt sent while a turn runs into that turn. It records
// only a `queued_command` attachment for it, never a `type: "user"` record, so
// without this the prompt has no row and its optimistic echo never reconciles.

import type { NativeChatBlock } from '../../shared/native-chat-types'
import { isKnownHarnessInjectedUserTurnText } from '../../shared/harness-injected-user-turns'
import { asRecord } from '../ai-vault/session-scanner-values'
import { claudeContentBlocks } from './transcript-record-blocks'

/** The blocks of a human prompt absorbed mid-turn, or null for any other record.
 *  Task notifications, peer hand-backs and coordinator deliveries share the
 *  attachment type but are not something the user typed. */
export function claudeAbsorbedPromptBlocks(
  record: Record<string, unknown>
): NativeChatBlock[] | null {
  if (record.type !== 'attachment' || record.isMeta === true) {
    return null
  }
  const attachment = asRecord(record.attachment)
  if (
    attachment?.type !== 'queued_command' ||
    attachment.commandMode !== 'prompt' ||
    attachment.isMeta === true
  ) {
    return null
  }
  // Older Claude Code omits `origin` on human prompts; any other origin is not the user.
  if (attachment.origin !== undefined && asRecord(attachment.origin)?.kind !== 'human') {
    return null
  }
  const blocks = claudeContentBlocks(attachment.prompt).filter(
    (block) => block.type === 'text' || block.type === 'image-ref'
  )
  const first = blocks[0]
  if (!first || (first.type === 'text' && isKnownHarnessInjectedUserTurnText(first.text))) {
    return null
  }
  return blocks
}
