import { z } from 'zod'
import type {
  TerminalMessageQueueEditResult,
  TerminalMessageQueueEvent,
  TerminalMessageQueueSendNextResult,
  TerminalMessageQueueSnapshot,
  TerminalMessageQueueStopResult,
  TerminalMessageQueueSubmitResult,
  TerminalQueuedMessage
} from '../../../src/shared/terminal-message-queue-contract'

// Replies and stream frames of `terminalMessageQueue.*`, checked against
// src/shared/terminal-message-queue-contract.ts. Loose objects: a newer host's extra fields pass.

const queuedMessageSchema = z.looseObject({
  id: z.string(),
  text: z.string(),
  imagePaths: z.array(z.string()).optional(),
  queuedAt: z.number(),
  editedAt: z.number().optional(),
  state: z.enum(['queued', 'delivering', 'undeliverable']),
  undeliverableReason: z.enum(['exited', 'failed']).optional(),
  editing: z.boolean().optional()
}) satisfies z.ZodType<TerminalQueuedMessage>

export const terminalMessageQueueSnapshotSchema = z.looseObject({
  revision: z.number(),
  // Why catch: a newer host's lead or verdict must not drop the whole snapshot.
  lead: z.enum(['working', 'idle', 'dialog', 'unknown']).catch('unknown'),
  interrupting: z.boolean(),
  terminal: z.enum(['live', 'unverifiable', 'exited']).catch('unverifiable'),
  items: z.array(queuedMessageSchema)
}) satisfies z.ZodType<TerminalMessageQueueSnapshot>

export const terminalMessageQueueSubmitResultSchema = z.union([
  z.looseObject({
    disposition: z.literal('queued'),
    item: queuedMessageSchema,
    snapshot: terminalMessageQueueSnapshotSchema
  }),
  z.looseObject({ disposition: z.literal('direct'), snapshot: terminalMessageQueueSnapshotSchema }),
  z.looseObject({
    disposition: z.literal('refused'),
    reason: z.enum(['queue-full', 'terminal-exited'])
  })
]) satisfies z.ZodType<TerminalMessageQueueSubmitResult>

export const terminalMessageQueueSnapshotReplySchema = z.looseObject({
  snapshot: terminalMessageQueueSnapshotSchema
}) satisfies z.ZodType<{ snapshot: TerminalMessageQueueSnapshot }>

export const terminalMessageQueueEditResultSchema = z.looseObject({
  outcome: z.enum(['edited', 'held', 'released', 'not-found', 'not-queued']),
  snapshot: terminalMessageQueueSnapshotSchema
}) satisfies z.ZodType<TerminalMessageQueueEditResult>

export const terminalMessageQueueStopResultSchema = z.looseObject({
  outcome: z.enum(['turn-ended', 'not-working', 'unverifiable', 'exited']),
  snapshot: terminalMessageQueueSnapshotSchema
}) satisfies z.ZodType<TerminalMessageQueueStopResult>

export const terminalMessageQueueSendNextResultSchema = z.looseObject({
  outcome: z.enum(['sent', 'empty', 'held', 'exited']),
  snapshot: terminalMessageQueueSnapshotSchema
}) satisfies z.ZodType<TerminalMessageQueueSendNextResult>

const terminalMessageQueueEventSchema = z.union([
  z.looseObject({ type: z.literal('snapshot'), snapshot: terminalMessageQueueSnapshotSchema }),
  z.looseObject({ type: z.literal('delivered'), item: queuedMessageSchema }),
  z.looseObject({ type: z.literal('removed'), itemId: z.string() }),
  z.looseObject({ type: z.literal('end') })
]) satisfies z.ZodType<TerminalMessageQueueEvent>

/** A stream frame, or null for one this client cannot read (ignored, never guessed at). */
export function decodeTerminalMessageQueueEvent(raw: unknown): TerminalMessageQueueEvent | null {
  const parsed = terminalMessageQueueEventSchema.safeParse(raw)
  return parsed.success ? parsed.data : null
}
