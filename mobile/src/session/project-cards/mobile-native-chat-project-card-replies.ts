import AsyncStorage from '@react-native-async-storage/async-storage'

// Free-text card replies cannot be matched back from the transcript, so their text is kept here.
const STORAGE_KEY = 'orca:nativeChatProjectCardReplies:v1'
const MAX_RECORDS = 200

type ReplyRecords = Record<string, { text: string; at: number }>

async function readRecords(): Promise<ReplyRecords> {
  try {
    const parsed: unknown = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) ?? '{}')
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return {}
    }
    const records: ReplyRecords = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (
        typeof value === 'object' &&
        value !== null &&
        'text' in value &&
        typeof value.text === 'string' &&
        'at' in value &&
        typeof value.at === 'number'
      ) {
        records[key] = { text: value.text, at: value.at }
      }
    }
    return records
  } catch {
    return {}
  }
}

export async function readMobileNativeChatProjectCardReply(
  cardKey: string
): Promise<string | null> {
  return (await readRecords())[cardKey]?.text ?? null
}

export async function recordMobileNativeChatProjectCardReply(
  cardKey: string,
  text: string
): Promise<void> {
  const records = await readRecords()
  records[cardKey] = { text, at: Date.now() }
  const kept = Object.entries(records)
    .sort((left, right) => right[1].at - left[1].at)
    .slice(0, MAX_RECORDS)
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(kept)))
  } catch {
    // The reply still sent; it just will not survive a restart.
  }
}
