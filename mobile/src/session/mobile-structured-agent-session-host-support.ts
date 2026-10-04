import {
  AGENT_SESSION_PROMPT_CANCEL_RUNTIME_CAPABILITY,
  AGENT_SESSION_QUESTION_ANSWERS_RUNTIME_CAPABILITY,
  AGENT_SESSION_QUEUED_MESSAGES_RUNTIME_CAPABILITY
} from '../../../src/shared/protocol-version'
import {
  TERMINAL_MESSAGE_QUEUE_RUNTIME_CAPABILITY,
  TERMINAL_MESSAGE_QUEUE_UNSUBSCRIBE_RUNTIME_CAPABILITY
} from '../../../src/shared/terminal-message-queue-capability'

/** Agent-session features the connected host advertised; null until the status probe answers. */
export type StructuredAgentSessionHostSupport = {
  promptCancel: boolean
  questionAnswers: boolean
  /** Mid-turn sends queue as host-held drafts; an older host keeps today's immediate path. */
  queuedMessages: boolean
  /** The host holds terminal-chat prompts sent mid-turn (terminal.message-queue.v1). */
  terminalMessageQueue?: boolean
  /** The host ends one queue stream on request (terminal.message-queue-unsubscribe.v1). */
  terminalMessageQueueUnsubscribe?: boolean
}

export function structuredAgentSessionHostSupport(
  capabilities: readonly string[]
): StructuredAgentSessionHostSupport {
  return {
    promptCancel: capabilities.includes(AGENT_SESSION_PROMPT_CANCEL_RUNTIME_CAPABILITY),
    questionAnswers: capabilities.includes(AGENT_SESSION_QUESTION_ANSWERS_RUNTIME_CAPABILITY),
    queuedMessages: capabilities.includes(AGENT_SESSION_QUEUED_MESSAGES_RUNTIME_CAPABILITY),
    terminalMessageQueue: capabilities.includes(TERMINAL_MESSAGE_QUEUE_RUNTIME_CAPABILITY),
    terminalMessageQueueUnsubscribe: capabilities.includes(
      TERMINAL_MESSAGE_QUEUE_UNSUBSCRIBE_RUNTIME_CAPABILITY
    )
  }
}
