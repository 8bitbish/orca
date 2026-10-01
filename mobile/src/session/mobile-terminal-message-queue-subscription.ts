import type { RpcClient } from '../transport/rpc-client'
import type {
  TerminalMessageQueueEvent,
  TerminalMessageQueueSession
} from '../../../src/shared/terminal-message-queue-contract'
import { decodeTerminalMessageQueueEvent } from './mobile-terminal-message-queue-schema'

/**
 * Opens one terminal's queue stream. The transport replays the subscribe after a reconnect, and the
 * host answers each (re)subscribe with a fresh snapshot first, so a reconnect needs nothing here.
 * `onClosed` fires when the host ends the stream or refuses it; the caller decides when to retry.
 */
export function subscribeMobileTerminalMessageQueue(
  client: Pick<RpcClient, 'subscribe'>,
  terminal: string,
  session: TerminalMessageQueueSession | null,
  handlers: {
    onEvent: (event: Exclude<TerminalMessageQueueEvent, { type: 'end' }>) => void
    onClosed: () => void
  }
): () => void {
  let closed = false
  const close = (): void => {
    if (!closed) {
      closed = true
      handlers.onClosed()
    }
  }
  const unsubscribe = client.subscribe(
    'terminalMessageQueue.subscribe',
    { terminal, ...(session ? { session } : {}) },
    (raw) => {
      if (closed) {
        return
      }
      if (isStreamError(raw)) {
        close()
        return
      }
      const event = decodeTerminalMessageQueueEvent(raw)
      if (!event) {
        return
      }
      if (event.type === 'end') {
        close()
        return
      }
      handlers.onEvent(event)
    }
  )
  return () => {
    closed = true
    unsubscribe()
  }
}

function isStreamError(raw: unknown): boolean {
  return typeof raw === 'object' && raw !== null && 'type' in raw && raw.type === 'error'
}
