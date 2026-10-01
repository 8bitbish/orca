import { agentImagePasteWrites, formatAgentImagePath } from '../../shared/agent-image-paste'
import { buildAgentPromptPasteBytes } from '../../shared/agent-prompt-injection'
import type { TerminalQueuedMessage } from '../../shared/terminal-message-queue-contract'
import type { TerminalMessageQueueDeliveryOutcome } from './terminal-message-queue'

/** Ctrl+U: empties whatever the user left half-typed in the TUI, as every composer send does. */
export const QUEUE_CLEAR_INPUT_LINE = '\x15'
/** The agent-TUI interrupt key; the same byte the desktop Stop button writes. */
export const QUEUE_INTERRUPT_KEY = '\x1b'
/** Matches the composer's gap between an image paste and the text that follows it. */
export const QUEUE_IMAGE_SETTLE_MS = 300

export type QueueDeliveryWriter = {
  writeRaw: (bytes: string) => Promise<void>
  /** The runtime's verified agent-prompt send: paste, submit, and wait for the turn to start. */
  sendPrompt: (text: string) => Promise<void>
  submit: () => Promise<void>
  sleep: (ms: number) => Promise<void>
}

export async function deliverQueuedMessage(
  writer: QueueDeliveryWriter,
  item: Pick<TerminalQueuedMessage, 'text' | 'imagePaths'>,
  agent: string | null
): Promise<TerminalMessageQueueDeliveryOutcome> {
  try {
    await writer.writeRaw(QUEUE_CLEAR_INPUT_LINE)
    const hasText = item.text.trim().length > 0
    const imagePaths = item.imagePaths ?? []
    if (imagePaths.length > 0) {
      const pastes = imagePaths.map((path) =>
        buildAgentPromptPasteBytes(formatAgentImagePath(agent, path))
      )
      for (const payload of agentImagePasteWrites(agent, pastes, hasText)) {
        await writer.writeRaw(payload)
      }
      await writer.sleep(QUEUE_IMAGE_SETTLE_MS)
    }
    await (hasText ? writer.sendPrompt(item.text) : writer.submit())
    return 'delivered'
  } catch (error) {
    return classifyQueueDeliveryError(error)
  }
}

export function classifyQueueDeliveryError(error: unknown): TerminalMessageQueueDeliveryOutcome {
  const code = error instanceof Error ? error.message : ''
  switch (code) {
    // Submitted, but the agent showed no turn start in time: it has the prompt.
    case 'agent_prompt_stalled':
      return 'delivered'
    // A question or approval appeared; the runtime refuses to type into it.
    case 'agent_prompt_blocked':
      return 'dialog'
    case 'terminal_not_writable':
    case 'terminal_handle_stale':
    case 'terminal_not_found':
      return 'unverifiable'
    default:
      return 'failed'
  }
}
