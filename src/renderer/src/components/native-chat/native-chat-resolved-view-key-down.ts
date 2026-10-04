import type React from 'react'
import type { KeybindingOverrides } from '../../../../shared/keybindings'
import { getShortcutPlatform } from '@/lib/shortcut-platform'
import type { NativeChatComposerHandle } from './native-chat-composer-types'
import { matchNativeChatSplitShortcut } from './native-chat-split-shortcut'
import { routeNativeChatRootKeyToInput } from './native-chat-root-key-routing'

/** The terminal-backed chat pane's capture-phase keys: split shortcuts, then keys
 *  pressed outside an input route to the chat's input. */
export function handleNativeChatResolvedViewKeyDown(
  event: React.KeyboardEvent<HTMLElement>,
  args: {
    keybindings: KeybindingOverrides
    splitActions: { onSplitRight: () => void; onSplitDown: () => void } | undefined
    composer: NativeChatComposerHandle | null
    questionAnswerInput: HTMLInputElement | null
  }
): void {
  const splitDirection = event.repeat
    ? null
    : matchNativeChatSplitShortcut(event, getShortcutPlatform(), args.keybindings)
  if (splitDirection && args.splitActions) {
    event.preventDefault()
    event.stopPropagation()
    if (splitDirection === 'right') {
      args.splitActions.onSplitRight()
    } else {
      args.splitActions.onSplitDown()
    }
    return
  }
  routeNativeChatRootKeyToInput(event, args.composer, args.questionAnswerInput)
}
