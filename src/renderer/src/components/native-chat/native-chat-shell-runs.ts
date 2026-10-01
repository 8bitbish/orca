// The app's one Run engine, wired to the runtime and an unopened xterm per run.

import { createNativeChatShellRunEngine } from './native-chat-shell-run-engine'
import { createNativeChatShellRunScreen } from './native-chat-shell-run-screen'
import { nativeChatShellRunRuntimeTransport } from './native-chat-shell-run-transport'

export const nativeChatShellRuns = createNativeChatShellRunEngine({
  transport: nativeChatShellRunRuntimeTransport,
  createScreen: createNativeChatShellRunScreen
})
