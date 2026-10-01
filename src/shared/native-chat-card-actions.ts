// The buttons on a chat card (project cards, Slack cards). A button only ever
// sends `reply` as the user's next chat message, or opens a free-text box.

export type NativeChatCardActionStyle = 'primary' | 'secondary'

export type NativeChatCardAction = {
  /** Position-derived; a card's actions never reorder. */
  id: string
  label: string
  style: NativeChatCardActionStyle
} & ({ kind: 'reply'; reply: string } | { kind: 'input' })

export const NATIVE_CHAT_CARD_MAX_ACTIONS = 4
const MAX_LABEL_LENGTH = 40
const MAX_REPLY_LENGTH = 2000
const ACTION_KEYS = new Set(['label', 'reply', 'input', 'style'])

export function isNativeChatCardRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Trimmed text, undefined when absent or blank, null when not a string or too long. */
export function optionalNativeChatCardText(value: unknown, max: number): string | undefined | null {
  if (value === undefined) {
    return undefined
  }
  if (typeof value !== 'string' || value.length > max) {
    return null
  }
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

function parseAction(value: unknown, id: string, closed: boolean): NativeChatCardAction | null {
  if (!isNativeChatCardRecord(value)) {
    return null
  }
  if (closed && Object.keys(value).some((key) => !ACTION_KEYS.has(key))) {
    return null
  }
  const label = optionalNativeChatCardText(value.label, MAX_LABEL_LENGTH)
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
  const reply = optionalNativeChatCardText(value.reply, MAX_REPLY_LENGTH)
  return reply ? { id, kind: 'reply', label, reply, style } : null
}

/** Null when the list or any action is outside the shape; `closed` also refuses unknown keys. */
export function parseNativeChatCardActions(
  value: unknown,
  { closed = false }: { closed?: boolean } = {}
): NativeChatCardAction[] | null {
  const raw = value ?? []
  if (!Array.isArray(raw) || raw.length > NATIVE_CHAT_CARD_MAX_ACTIONS) {
    return null
  }
  const actions: NativeChatCardAction[] = []
  for (const [index, entry] of raw.entries()) {
    const action = parseAction(entry, `action-${index}`, closed)
    if (!action) {
      return null
    }
    actions.push(action)
  }
  return actions
}
