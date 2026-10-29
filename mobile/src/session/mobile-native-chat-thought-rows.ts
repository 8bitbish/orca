// Reasoning rows as the mobile transcript draws them, beyond upstream's reasoning row: durations
// read from a terminal transcript, and thoughts with no text (Claude Code 2.1.x journals thinking
// blocks with an empty string) drawn as one "Thought" line, back-to-back ones merged.

import { agentJournalItemSubagentId } from '../../../src/shared/agent-session-journal-producer'
import { isNativeChatThoughtMarker } from '../../../src/shared/native-chat-thought-marker'
import {
  nativeChatReasoningHeadline,
  nativeChatReasoningHeadlineText
} from '../../../src/shared/native-chat/transcript/native-chat-reasoning-row'
import type { NativeChatMessage } from '../../../src/shared/native-chat-types'

/** The end a transcript-read duration implies, for a reasoning row the journal did not time. */
function withTranscriptThoughtEnd(
  message: NativeChatMessage,
  seconds: number | undefined
): NativeChatMessage {
  return message.role !== 'reasoning' ||
    seconds === undefined ||
    message.completedAt !== undefined ||
    message.timestamp === null
    ? message
    : { ...message, state: 'completed', completedAt: message.timestamp + seconds * 1000 }
}

/** One line for a run of empty thoughts: the first's start to the last's end. */
function mergeThoughtMarkers(first: NativeChatMessage, last: NativeChatMessage): NativeChatMessage {
  const end =
    last.completedAt ??
    (first.completedAt !== undefined && first.timestamp !== null && last.timestamp !== null
      ? first.completedAt + Math.max(0, last.timestamp - first.timestamp)
      : undefined)
  const { completedAt: _dropped, ...rest } = first
  return {
    ...rest,
    ...(last.state === undefined ? {} : { state: last.state }),
    ...(end === undefined ? {} : { completedAt: end })
  }
}

/**
 * The rows the transcript draws: transcript durations applied, back-to-back empty thoughts of
 * one agent merged, and an empty thought that is a working turn's newest row marked running so
 * it reads "Thinking…".
 */
export function mobileNativeChatThoughtRows(
  messages: NativeChatMessage[],
  thoughtSeconds: ReadonlyMap<string, number>,
  agentWorking: boolean
): NativeChatMessage[] {
  const rows: NativeChatMessage[] = []
  for (const message of messages) {
    const row = withTranscriptThoughtEnd(message, thoughtSeconds.get(message.id))
    const previous = rows.at(-1)
    if (
      previous &&
      isNativeChatThoughtMarker(previous) &&
      isNativeChatThoughtMarker(row) &&
      agentJournalItemSubagentId(previous) === agentJournalItemSubagentId(row)
    ) {
      rows[rows.length - 1] = mergeThoughtMarkers(previous, row)
      continue
    }
    rows.push(row)
  }
  const newest = rows.at(-1)
  if (agentWorking && newest && isNativeChatThoughtMarker(newest) && newest.state !== 'completed') {
    rows[rows.length - 1] = { ...newest, state: 'running' }
  }
  return rows.length === messages.length && rows.every((row, i) => row === messages[i])
    ? messages
    : rows
}

/** An empty thought's one line: "Thinking…" while it runs in a live turn, else upstream's
 *  "Thought for Ns" / "Thought". */
export function mobileNativeChatThoughtMarkerLabel(
  message: Pick<NativeChatMessage, 'state' | 'completedAt' | 'timestamp'>,
  live: boolean
): string {
  if (live && message.state === 'running') {
    return 'Thinking…'
  }
  const headline = nativeChatReasoningHeadline(message, { live: false })
  return headline.kind === 'reasoning' ? 'Thought' : nativeChatReasoningHeadlineText(headline)
}
