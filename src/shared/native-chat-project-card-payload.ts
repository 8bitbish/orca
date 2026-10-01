// The JSON body of a ```project-card fence. Anything that does not match this
// shape exactly is rejected, and the fence then shows as the raw block it is.

import {
  isNativeChatCardRecord,
  optionalNativeChatCardText,
  parseNativeChatCardActions,
  type NativeChatCardAction,
  type NativeChatCardActionStyle
} from './native-chat-card-actions'

/** The fence language for a live project card. The pipeline drops an info
 *  string's later words, so `widget project-card` would reach us as `widget`. */
export const NATIVE_CHAT_PROJECT_CARD_FENCE = 'project-card'

export type NativeChatProjectCardActionStyle = NativeChatCardActionStyle

export type NativeChatProjectCardAction = NativeChatCardAction

export type NativeChatProjectCardPayload = {
  /** `repo/displayName`, a bare repo name (its main workspace), or a worktree id. */
  worktree: string
  note?: string
  ask?: string
  icon?: string
  actions: NativeChatProjectCardAction[]
}

const MAX_TEXT_LENGTH = 600
// An emoji with modifiers, or two letters; anything longer is not an icon.
const MAX_ICON_LENGTH = 8

/** Null for bad JSON or any field outside the documented shape. */
export function parseNativeChatProjectCardPayload(
  source: string
): NativeChatProjectCardPayload | null {
  let value: unknown
  try {
    value = JSON.parse(source)
  } catch {
    return null
  }
  if (!isNativeChatCardRecord(value)) {
    return null
  }
  const worktree = optionalNativeChatCardText(value.worktree, 512)
  const note = optionalNativeChatCardText(value.note, MAX_TEXT_LENGTH)
  const ask = optionalNativeChatCardText(value.ask, MAX_TEXT_LENGTH)
  const icon = optionalNativeChatCardText(value.icon, MAX_ICON_LENGTH)
  if (!worktree || note === null || ask === null || icon === null) {
    return null
  }
  const actions = parseNativeChatCardActions(value.actions)
  if (!actions) {
    return null
  }
  return {
    worktree,
    ...(note ? { note } : {}),
    ...(ask ? { ask } : {}),
    ...(icon ? { icon } : {}),
    actions
  }
}
