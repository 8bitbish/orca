import type React from 'react'
import type { KeybindingOverrides } from '../../../../shared/keybindings'
import { getShortcutPlatform } from '@/lib/shortcut-platform'
import type { NativeChatComposerHandle } from './native-chat-composer-types'
import { matchNativeChatSplitShortcut } from './native-chat-split-shortcut'
import {
  shouldFocusNativeChatComposerFromEditingKey,
  shouldRedirectNativeChatTyping
} from './native-chat-typing-redirect'

/** The terminal-backed chat pane's capture-phase keys: split shortcuts, then typing
 *  anywhere in the pane lands in the composer. */
export function handleNativeChatResolvedViewKeyDown(
  event: React.KeyboardEvent<HTMLElement>,
  args: {
    keybindings: KeybindingOverrides
    splitActions: { onSplitRight: () => void; onSplitDown: () => void } | undefined
    composer: NativeChatComposerHandle | null
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
  // Backspace/Delete outside an input focuses the composer (like typing)
  // but inserts nothing — let the now-focused field handle the keystroke.
  if (shouldFocusNativeChatComposerFromEditingKey(event)) {
    args.composer?.focus()
    return
  }
  if (!shouldRedirectNativeChatTyping(event)) {
    return
  }
  if (!args.composer?.insertTypedText(event.key)) {
    return
  }
  event.preventDefault()
  event.stopPropagation()
}
