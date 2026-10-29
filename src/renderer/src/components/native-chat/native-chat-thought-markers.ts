// Thoughts the provider recorded with no text (Claude Code journals every thinking block that
// way) draw one "Thought" / "Thought for Ns" line, and back-to-back ones in a turn draw as one.
// Durations here are the journal-derived fallback (`nativeChatSessionThoughtSeconds`), used only
// where the host kept no timing of its own.

import { createContext } from 'react'
import type { NativeChatReasoningHeadline } from '../../../../shared/native-chat/transcript/native-chat-reasoning-row'
import { nativeChatRowRendersContent } from '../../../../shared/native-chat-row-content'
import { isNativeChatThoughtMarker } from '../../../../shared/native-chat-thought-marker'
import { formatNativeChatDuration } from '../../../../shared/native-chat-turn-status'
import type { NativeChatMessage } from '../../../../shared/native-chat-types'

export type NativeChatThoughtTiming = {
  /** Fallback whole seconds per reasoning row; a run of markers sums onto its first. */
  seconds: ReadonlyMap<string, number | null>
  /** Markers folded into the one before them: they draw nothing. */
  merged: ReadonlySet<string>
}

export const NO_NATIVE_CHAT_THOUGHT_TIMING: NativeChatThoughtTiming = {
  seconds: new Map(),
  merged: new Set()
}

export const NativeChatThoughtTimingContext = createContext<NativeChatThoughtTiming>(
  NO_NATIVE_CHAT_THOUGHT_TIMING
)

export function nativeChatThoughtTiming(
  messages: readonly NativeChatMessage[],
  turnKeys: readonly (string | undefined)[],
  fallbackSeconds: ReadonlyMap<string, number>
): NativeChatThoughtTiming {
  const seconds = new Map<string, number | null>(fallbackSeconds)
  const merged = new Set<string>()
  let run: {
    headId: string
    turnKey: string | undefined
    startedAt: number | null
    headSeconds: number | null
  } | null = null
  for (const [index, message] of messages.entries()) {
    if (!isNativeChatThoughtMarker(message)) {
      // Rows that draw nothing do not separate two thoughts.
      if (message.role !== 'system' && nativeChatRowRendersContent(message.blocks)) {
        run = null
      }
      continue
    }
    const turnKey = turnKeys[index]
    if (run && run.turnKey === turnKey) {
      // The run ends at this thought; nothing visible ran since the first began.
      const { headSeconds, startedAt } = run
      seconds.set(
        run.headId,
        headSeconds !== null && startedAt !== null && message.timestamp !== null
          ? Math.floor(headSeconds + Math.max(0, message.timestamp - startedAt) / 1000)
          : null
      )
      merged.add(message.id)
      continue
    }
    const headSeconds = fallbackSeconds.get(message.id) ?? null
    run = { headId: message.id, turnKey, startedAt: message.timestamp, headSeconds }
    seconds.set(message.id, headSeconds)
  }
  return { seconds, merged }
}

/** The host's headline, unless it kept no duration and the journal has one. A thought with no
 *  text has ended once it is recorded, so it reads "Thought" rather than "Reasoning". */
export function nativeChatReasoningHeadlineWithFallback(
  headline: NativeChatReasoningHeadline,
  fallbackSeconds: number | null | undefined,
  isMarker: boolean
): NativeChatReasoningHeadline {
  if (headline.kind === 'thoughtFor') {
    return headline
  }
  if (fallbackSeconds !== null && fallbackSeconds !== undefined) {
    return { kind: 'thoughtFor', duration: formatNativeChatDuration(fallbackSeconds) }
  }
  return isMarker ? { kind: 'thought' } : headline
}
