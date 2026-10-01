// Why: `terminalMessageQueue.*` is new; a client probes this before holding a prompt on the host,
// and a host without it leaves the client writing straight to the terminal as before.
export const TERMINAL_MESSAGE_QUEUE_RUNTIME_CAPABILITY = 'terminal.message-queue.v1' as const
// Why: `terminalMessageQueue.unsubscribe` ends one queue stream on a shared socket. A client that
// sees this marks its subscribe so its transport sends the unsubscribe; an older host never gets it.
export const TERMINAL_MESSAGE_QUEUE_UNSUBSCRIBE_RUNTIME_CAPABILITY =
  'terminal.message-queue-unsubscribe.v1' as const

export const TERMINAL_MESSAGE_QUEUE_RUNTIME_CAPABILITIES = [
  TERMINAL_MESSAGE_QUEUE_RUNTIME_CAPABILITY,
  TERMINAL_MESSAGE_QUEUE_UNSUBSCRIBE_RUNTIME_CAPABILITY
] as const
