// A reasoning row with no text: the provider recorded THAT the model thought but
// not what. Claude Code 2.1.x journals every thinking block with an empty
// `thinking` string and only a signature, and `redacted_thinking` never carries
// text. The row still draws as a one-line "Thought" / "Thought for Ns".
//
// Wire: a client that predates the marker sees a reasoning message with nothing to
// draw; older mobile builds paint that as a blank gap. The host therefore sends it
// only to clients that advertise AGENT_SESSION_THOUGHT_MARKER_CAPABILITY (see
// native-chat-thought-marker-projection.ts); in-process readers always get it.

import type { AgentJournalItemBody } from './agent-session-journal-types'
import type { NativeChatBlock, NativeChatRole } from './native-chat-types'

/** The body of a thought with no text. A fresh array each call: blocks are mutable. */
export function nativeChatThoughtMarkerBlocks(): NativeChatBlock[] {
  return [{ type: 'text', text: '' }]
}

function isBlankThought(role: NativeChatRole, blocks: readonly NativeChatBlock[]): boolean {
  return (
    role === 'reasoning' &&
    blocks.length > 0 &&
    blocks.every((block) => block.type === 'text' && block.text.trim() === '')
  )
}

export function isNativeChatThoughtMarker(message: {
  role: NativeChatRole
  blocks: readonly NativeChatBlock[]
}): boolean {
  return isBlankThought(message.role, message.blocks)
}

export function isAgentJournalThoughtMarkerBody(body: AgentJournalItemBody): boolean {
  return body.kind === 'message' && isBlankThought(body.role, body.blocks)
}
