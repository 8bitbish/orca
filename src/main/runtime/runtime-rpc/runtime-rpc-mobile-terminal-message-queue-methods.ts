// Queued prompts for terminal agents; shared with the desktop, gated by terminal.message-queue.v1.
export const TERMINAL_MESSAGE_QUEUE_MOBILE_METHODS = [
  'terminalMessageQueue.submit',
  'terminalMessageQueue.list',
  'terminalMessageQueue.remove',
  'terminalMessageQueue.edit',
  'terminalMessageQueue.stop',
  'terminalMessageQueue.sendNext',
  'terminalMessageQueue.subscribe'
] as const
