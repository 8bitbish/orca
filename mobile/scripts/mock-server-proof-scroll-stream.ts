import { readFileSync } from 'node:fs'
import type { NativeChatMessage } from '../../src/shared/native-chat-types'
import { proofScrollStreamRow } from './mock-server-proof-scroll-transcript'

// Why: Jake's jumps show while a reply streams in at the bottom. Writing a new token to
// `MOCK_CHAT_STREAM_FILE` starts one on cue: a row every `MOCK_CHAT_STREAM_EVERY_MS` (500), mixing
// prose, diagrams and proof cards, for `MOCK_CHAT_STREAM_ROWS` (40) rows.
const STREAM_FILE = process.env.MOCK_CHAT_STREAM_FILE
const EVERY_MS = Number(process.env.MOCK_CHAT_STREAM_EVERY_MS ?? 500)
const ROWS = Number(process.env.MOCK_CHAT_STREAM_ROWS ?? 40)
let sent = 0

function readToken(): string {
  try {
    return STREAM_FILE ? readFileSync(STREAM_FILE, 'utf8').trim() : ''
  } catch {
    return ''
  }
}

/** Streams appended rows through `emit` each time the control file's token changes; returns a stop. */
export function startProofScrollStream(emit: (messages: NativeChatMessage[]) => void): () => void {
  if (!STREAM_FILE) {
    return () => {}
  }
  let token = readToken()
  let left = 0
  let tick = 0
  const timer = setInterval(() => {
    const next = readToken()
    if (next !== token) {
      token = next
      left = ROWS
      console.log(`[mock] proof-scroll stream started (${token})`)
    }
    tick += 1
    if (left > 0 && tick % Math.max(1, Math.round(EVERY_MS / 100)) === 0) {
      emit([proofScrollStreamRow(sent)])
      sent += 1
      left -= 1
      if (left === 0) {
        console.log('[mock] proof-scroll stream finished')
      }
    }
  }, 100)
  return () => clearInterval(timer)
}
