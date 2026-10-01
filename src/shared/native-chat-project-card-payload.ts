// The JSON body of a ```project-card fence. Anything that does not match this
// shape exactly is rejected, and the fence then shows as the raw block it is.

/** The fence language for a live project card. The pipeline drops an info
 *  string's later words, so `widget project-card` would reach us as `widget`. */
export const NATIVE_CHAT_PROJECT_CARD_FENCE = 'project-card'

export type NativeChatProjectCardActionStyle = 'primary' | 'secondary'

export type NativeChatProjectCardAction = {
  /** Position-derived; a card's actions never reorder. */
  id: string
  label: string
  style: NativeChatProjectCardActionStyle
} & ({ kind: 'reply'; reply: string } | { kind: 'input' })

export type NativeChatProjectCardPayload = {
  /** `repo/displayName`, a bare repo name (its main workspace), or a worktree id. */
  worktree: string
  note?: string
  ask?: string
  icon?: string
  actions: NativeChatProjectCardAction[]
}

const MAX_ACTIONS = 4
const MAX_LABEL_LENGTH = 40
const MAX_REPLY_LENGTH = 2000
const MAX_TEXT_LENGTH = 600
// An emoji with modifiers, or two letters; anything longer is not an icon.
const MAX_ICON_LENGTH = 8

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function optionalText(value: unknown, max: number): string | undefined | null {
  if (value === undefined) {
    return undefined
  }
  if (typeof value !== 'string' || value.length > max) {
    return null
  }
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

function parseAction(value: unknown, id: string): NativeChatProjectCardAction | null {
  if (!isRecord(value)) {
    return null
  }
  const label = optionalText(value.label, MAX_LABEL_LENGTH)
  if (!label) {
    return null
  }
  if (value.style !== undefined && value.style !== 'primary' && value.style !== 'secondary') {
    return null
  }
  const style = value.style === 'primary' ? 'primary' : 'secondary'
  if (value.input === true) {
    return value.reply === undefined ? { id, kind: 'input', label, style } : null
  }
  if (value.input !== undefined && value.input !== false) {
    return null
  }
  const reply = optionalText(value.reply, MAX_REPLY_LENGTH)
  return reply ? { id, kind: 'reply', label, reply, style } : null
}

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
  if (!isRecord(value)) {
    return null
  }
  const worktree = optionalText(value.worktree, 512)
  const note = optionalText(value.note, MAX_TEXT_LENGTH)
  const ask = optionalText(value.ask, MAX_TEXT_LENGTH)
  const icon = optionalText(value.icon, MAX_ICON_LENGTH)
  if (!worktree || note === null || ask === null || icon === null) {
    return null
  }
  const rawActions = value.actions ?? []
  if (!Array.isArray(rawActions) || rawActions.length > MAX_ACTIONS) {
    return null
  }
  const actions: NativeChatProjectCardAction[] = []
  for (const [index, raw] of rawActions.entries()) {
    const action = parseAction(raw, `action-${index}`)
    if (!action) {
      return null
    }
    actions.push(action)
  }
  return {
    worktree,
    ...(note ? { note } : {}),
    ...(ask ? { ask } : {}),
    ...(icon ? { icon } : {}),
    actions
  }
}
