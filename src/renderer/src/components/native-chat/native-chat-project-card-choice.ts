// Desktop's record of free-text card replies, in localStorage. The choice itself is
// derived in src/shared/native-chat-project-card-choice.ts.

export {
  deriveNativeChatProjectCardChoice,
  nativeChatProjectCardKey,
  type NativeChatProjectCardChoice
} from '../../../../shared/native-chat-project-card-choice'

const RECORD_STORAGE_KEY = 'orca:nativeChatProjectCardReplies:v1'
const MAX_RECORDS = 200

type ReplyRecords = Record<string, { text: string; at: number }>

function readRecords(): ReplyRecords {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(RECORD_STORAGE_KEY) ?? '{}')
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? Object.fromEntries(
          Object.entries(parsed).filter(
            (entry): entry is [string, { text: string; at: number }] =>
              typeof entry[1]?.text === 'string' && typeof entry[1]?.at === 'number'
          )
        )
      : {}
  } catch {
    return {}
  }
}

export function readNativeChatProjectCardReply(cardKey: string): string | null {
  return readRecords()[cardKey]?.text ?? null
}

export function recordNativeChatProjectCardReply(cardKey: string, text: string): void {
  const records = readRecords()
  records[cardKey] = { text, at: Date.now() }
  const kept = Object.entries(records)
    .sort((left, right) => right[1].at - left[1].at)
    .slice(0, MAX_RECORDS)
  try {
    localStorage.setItem(RECORD_STORAGE_KEY, JSON.stringify(Object.fromEntries(kept)))
  } catch {
    // Storage can be full or blocked; the click still sent, it just will not survive a reload.
  }
}
