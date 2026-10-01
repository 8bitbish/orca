// How a chat Run reaches the Runs terminal, and how its end is observed. A reused
// interactive shell reports no per-command exit status, so the block runs as its own
// script under an explicit shell, bracketed by two OSC 777 markers keyed by a
// per-run id: the second carries that script's own `$?`. xterm ignores the markers,
// so the Runs tab shows only the block's output.
//
// The typed line is one `sh -c '...'` whose quoted body holds no single quote and no
// `!`, and whose arguments are base64, so it means the same to zsh, bash and fish.

import type { NativeChatShellRunInterpreter } from './native-chat-shell-run-block'

const START_PREFIX = '\u001b]777;orca-chat-run-start;'
const END_PREFIX = '\u001b]777;orca-chat-run-end;'
const BEL = '\u0007'
const ST = '\u001b\\'
const RUN_ID = /^[A-Za-z0-9-]{8,64}$/

// $1 script, $2 run id, $3 interpreter, $4 working directory. The INT trap keeps this
// wrapper alive through Stop, so the child's interrupted status still reaches `e`.
const RUNNER = [
  'trap : INT',
  'n=$2',
  'd() { printf %s "$1" | base64 -d 2>/dev/null || printf %s "$1" | base64 -D; }',
  'e() { rm -f "$f"; printf "\\033]777;orca-chat-run-end;%s;%s\\007" "$n" "$1"; exit "$1"; }',
  'printf "\\033]777;orca-chat-run-start;%s\\007" "$n"',
  'f=$(mktemp "${TMPDIR:-/tmp}/orca-chat-run.XXXXXX") || e 126',
  'd "$1" > "$f" || e 126',
  'w=$(d "$4")',
  'cd "$w" || { printf "orca: cannot open %s\\n" "$w"; e 1; }',
  'case "$3" in auto) if command -v bash >/dev/null 2>&1; then bash "$f"; else sh "$f"; fi;; ' +
    '*) if command -v "$3" >/dev/null 2>&1; then "$3" "$f"; ' +
    'else printf "orca: %s is not installed here\\n" "$3"; (exit 127); fi;; esac',
  'e $?'
].join('; ')

function encodeBase64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  }
  return btoa(binary)
}

export function isNativeChatShellRunId(value: string): boolean {
  return RUN_ID.test(value)
}

export function buildNativeChatShellRunCommandLine(args: {
  script: string
  interpreter: NativeChatShellRunInterpreter
  cwd: string
  runId: string
}): string {
  if (!isNativeChatShellRunId(args.runId)) {
    throw new Error('Invalid run id')
  }
  const script = args.script.endsWith('\n') ? args.script : `${args.script}\n`
  // The leading space keeps the line out of history for HISTCONTROL=ignorespace / HIST_IGNORE_SPACE.
  return ` sh -c '${RUNNER}' orca-chat-run ${encodeBase64(script)} ${args.runId} ${args.interpreter} ${encodeBase64(args.cwd)}`
}

export type NativeChatShellRunMarkerEvent =
  | { type: 'start' }
  | { type: 'output'; data: string }
  | { type: 'end'; exitCode: number }

/** Splits a raw terminal stream into this run's start, its output, and its end. */
export function createNativeChatShellRunMarkerScanner(runId: string): {
  push: (chunk: string) => NativeChatShellRunMarkerEvent[]
} {
  const start = `${START_PREFIX}${runId}`
  const end = `${END_PREFIX}${runId};`
  let phase: 'before' | 'running' | 'done' = 'before'
  let carry = ''

  // How much of `text`'s tail could be the first part of `marker`, to hold for the next chunk.
  const partialTail = (text: string, marker: string): number => {
    for (let length = Math.min(text.length, marker.length + 12); length > 0; length -= 1) {
      const tail = text.slice(text.length - length)
      if (marker.startsWith(tail) || tail.startsWith(marker)) {
        return length
      }
    }
    return 0
  }

  return {
    push: (chunk) => {
      const events: NativeChatShellRunMarkerEvent[] = []
      let buffer = carry + chunk
      carry = ''
      if (phase === 'before') {
        const at = buffer.indexOf(start)
        const terminator = at === -1 ? -1 : findTerminator(buffer, at + start.length)
        if (terminator === -1) {
          // Everything before the start (the echoed command line, the prompt) is not output.
          carry = buffer.slice(buffer.length - partialTail(buffer, start))
          return events
        }
        phase = 'running'
        events.push({ type: 'start' })
        buffer = buffer.slice(terminator)
      }
      if (phase === 'running') {
        const at = buffer.indexOf(end)
        if (at !== -1) {
          const rest = buffer.slice(at + end.length)
          const digits = /^\d{1,3}/.exec(rest)?.[0] ?? ''
          if (digits && findTerminator(rest, digits.length) !== -1) {
            if (at > 0) {
              events.push({ type: 'output', data: buffer.slice(0, at) })
            }
            phase = 'done'
            events.push({ type: 'end', exitCode: Number(digits) })
            return events
          }
        }
        const hold = at === -1 ? partialTail(buffer, end) : buffer.length - at
        const output = buffer.slice(0, buffer.length - hold)
        carry = buffer.slice(buffer.length - hold)
        if (output) {
          events.push({ type: 'output', data: output })
        }
      }
      return events
    }
  }
}

/** Index just past the BEL or ST closing the OSC whose payload starts at `from`, or -1. */
function findTerminator(buffer: string, from: number): number {
  if (buffer.startsWith(BEL, from)) {
    return from + BEL.length
  }
  if (buffer.startsWith(ST, from)) {
    return from + ST.length
  }
  return -1
}
