import { useNativeChatContextUsageSummary } from './use-native-chat-context-usage-summary'
import { useNativeChatSessionOptions } from './use-native-chat-session-options'
import { useNativeChatSessionOptionCommand } from './use-native-chat-session-option-command'
import type { NativeChatStructuredComposerTransport } from './native-chat-composer-types'

type CommandInput = Parameters<typeof useNativeChatSessionOptionCommand>[0]
type PtyOptionsInput = Omit<Parameters<typeof useNativeChatSessionOptions>[0], 'dispatchCommand'>

/** The composer's session-option pickers: a structured chat's own, else the terminal's. */
export function useNativeChatComposerSessionOptions(
  command: CommandInput,
  pty: PtyOptionsInput,
  structuredTransport: NativeChatStructuredComposerTransport | undefined
) {
  const { dispatch, isDispatching } = useNativeChatSessionOptionCommand(command)
  const { surface: ptySurface, snapshot: ptySnapshot } = useNativeChatSessionOptions({
    ...pty,
    dispatchCommand: dispatch
  })
  return {
    isDispatchingSessionOption: isDispatching,
    ptySessionOptionsSurface: ptySurface,
    sessionOptionsSurface: structuredTransport?.optionsSurface ?? ptySurface,
    sessionOptionsSnapshot: structuredTransport?.optionSnapshot ?? ptySnapshot,
    contextUsageSummary: useNativeChatContextUsageSummary(structuredTransport)
  }
}
