import { z } from 'zod'
import {
  TERMINAL_MESSAGE_QUEUE_MAX_IMAGES,
  TERMINAL_MESSAGE_QUEUE_MAX_TEXT_LENGTH
} from '../terminal-message-queue-contract'

// Why both: a paired client names a terminal by its runtime handle; the desktop's own renderer only
// knows the local PTY id. The host resolves either to the same PTY, so both reach one queue.
const TerminalMessageQueueTargetFields = {
  terminal: z.string().min(1).max(512).optional(),
  ptyId: z.string().min(1).max(512).optional()
}

const TerminalMessageQueueSessionSchema = z.object({
  agent: z.string().min(1).max(64),
  sessionId: z.string().min(1).max(512),
  transcriptPath: z.string().min(1).max(4096).optional()
})

function requireTarget(value: { terminal?: string; ptyId?: string }): boolean {
  return value.terminal !== undefined || value.ptyId !== undefined
}

const TARGET_REQUIRED = { message: 'Missing terminal or PTY id' }

export const TerminalMessageQueueTarget = z
  .object({
    ...TerminalMessageQueueTargetFields,
    session: TerminalMessageQueueSessionSchema.optional()
  })
  .refine(requireTarget, TARGET_REQUIRED)

// `capabilities.unsubscribe` is the client saying it will end this stream with
// `terminalMessageQueue.unsubscribe`; it is sent only to a host that advertised that method.
export const TerminalMessageQueueSubscribe = z
  .object({
    ...TerminalMessageQueueTargetFields,
    session: TerminalMessageQueueSessionSchema.optional(),
    capabilities: z.object({ unsubscribe: z.literal(1).optional() }).optional()
  })
  .refine(requireTarget, TARGET_REQUIRED)

// `subscriptionId` is the frame id of the subscribe it ends; the host scopes it to the caller's socket.
export const TerminalMessageQueueUnsubscribe = z.object({
  subscriptionId: z.string().min(1).max(512)
})

export const TerminalMessageQueueSubmit = z
  .object({
    ...TerminalMessageQueueTargetFields,
    session: TerminalMessageQueueSessionSchema.optional(),
    text: z.string().max(TERMINAL_MESSAGE_QUEUE_MAX_TEXT_LENGTH),
    imagePaths: z
      .array(z.string().min(1).max(4096))
      .max(TERMINAL_MESSAGE_QUEUE_MAX_IMAGES)
      .optional()
  })
  .refine(requireTarget, TARGET_REQUIRED)
  .refine((value) => value.text.trim() !== '' || (value.imagePaths?.length ?? 0) > 0, {
    message: 'Nothing to send'
  })

export const TerminalMessageQueueRemove = z
  .object({
    ...TerminalMessageQueueTargetFields,
    itemId: z.string().min(1).max(128)
  })
  .refine(requireTarget, TARGET_REQUIRED)

// `editing: true` takes (or renews) the edit lease, `text` saves and releases it, `editing: false`
// releases it unchanged.
export const TerminalMessageQueueEdit = z
  .object({
    ...TerminalMessageQueueTargetFields,
    itemId: z.string().min(1).max(128),
    text: z.string().max(TERMINAL_MESSAGE_QUEUE_MAX_TEXT_LENGTH).optional(),
    editing: z.boolean().optional()
  })
  .refine(requireTarget, TARGET_REQUIRED)
  .refine((value) => value.text !== undefined || value.editing !== undefined, {
    message: 'Nothing to edit'
  })
