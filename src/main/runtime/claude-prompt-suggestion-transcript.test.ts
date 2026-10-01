import { describe, expect, it } from 'vitest'
import {
  readRuntimeFixture,
  replayTranscript,
  type TranscriptReplayFrame
} from './agent-transcript-replay-test-harness'

// Claude Code 2.1.286 at 100x30 (see the .meta.json): the stock `Try "…"` placeholder, two
// replies, then the dim (SGR 2) prompt suggestion it paints into the empty composer, typed text
// that replaces it, the suggestion again once that is erased, and `/comp` with its menu open.
// Deliberately reverses 419e3b4496, which reported the suggestion as the typed `draft`.
const FIXTURE = 'claude-prompt-suggestion'
const SUGGESTION = 'now write the full README'

const SHOW_CURSOR = '\x1b[?25h'

/** Claude hides the cursor while it repaints and shows it once the frame is done, so a read
 *  only sees a composer between the two; fixed 64-char chunks never land there. Cut after each
 *  show-cursor instead, which is where a paint the reader could have seen ends. */
function paintChunks(data: string): string[] {
  const chunks: string[] = []
  let start = 0
  for (let at = data.indexOf(SHOW_CURSOR); at !== -1; at = data.indexOf(SHOW_CURSOR, start)) {
    chunks.push(data.slice(start, at + SHOW_CURSOR.length))
    start = at + SHOW_CURSOR.length
  }
  return start < data.length ? [...chunks, data.slice(start)] : chunks
}

async function frames(): Promise<TranscriptReplayFrame[]> {
  const replayed: TranscriptReplayFrame[] = []
  for await (const frame of replayTranscript(paintChunks(readRuntimeFixture(FIXTURE)), 100, 30)) {
    replayed.push(frame)
  }
  return replayed
}

describe('Claude Code prompt suggestion transcript', () => {
  it('reports the dim suggestion as a suggestion, never as the draft, and keeps it off the screen', async () => {
    const replayed = await frames()
    const suggested = replayed.filter((frame) => frame.suggestion === SUGGESTION)

    expect(suggested.length).toBeGreaterThan(0)
    for (const frame of suggested) {
      expect(frame.draft).toBeUndefined()
      expect(frame.screenLines).toContain('❯')
      expect(frame.screenLines.some((line) => line.includes(SUGGESTION))).toBe(false)
    }
    expect(replayed.some((frame) => frame.draft?.includes('now write'))).toBe(false)
  })

  it('reports typed text as the draft', async () => {
    const replayed = await frames()

    expect(replayed.some((frame) => frame.draft === 'hello there')).toBe(true)
    const completing = replayed.filter((frame) => frame.draft === '/comp')
    expect(completing.length).toBeGreaterThan(0)
    expect(completing.every((frame) => frame.suggestion === undefined)).toBe(true)
  })

  it('leaves the stock placeholder on screen, as before', async () => {
    const replayed = await frames()
    const placeholder = replayed.filter((frame) =>
      frame.screenLines.some((line) => line.includes('Try "how do I log an error?"'))
    )

    expect(placeholder.length).toBeGreaterThan(0)
    for (const frame of placeholder) {
      expect(frame.draft).toBeUndefined()
      expect(frame.suggestion).toBeUndefined()
    }
  })
})
