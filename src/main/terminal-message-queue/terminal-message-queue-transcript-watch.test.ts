import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { watchTranscriptForInterrupts } from './terminal-message-queue-transcript-watch'

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

function line(record: object): string {
  return `${JSON.stringify({ sessionId: 's-1', timestamp: new Date().toISOString(), ...record })}\n`
}

describe('watchTranscriptForInterrupts', () => {
  it('reports an interrupt marker appended after the watch began, and nothing else', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'mq-transcript-'))
    dirs.push(dir)
    const transcriptPath = path.join(dir, 's-1.jsonl')
    writeFileSync(
      transcriptPath,
      line({ type: 'user', uuid: 'u1', message: { role: 'user', content: 'go' } })
    )
    const onTurnEnded = vi.fn()
    const stop = watchTranscriptForInterrupts(
      { agent: 'claude', sessionId: 's-1', transcriptPath },
      onTurnEnded
    )
    await new Promise((resolve) => setTimeout(resolve, 500))
    appendFileSync(
      transcriptPath,
      line({
        type: 'assistant',
        uuid: 'a1',
        message: { id: 'm1', role: 'assistant', stop_reason: 'end_turn', content: 'done' }
      })
    )
    await new Promise((resolve) => setTimeout(resolve, 500))
    expect(onTurnEnded).not.toHaveBeenCalled()
    const started = Date.now()
    appendFileSync(
      transcriptPath,
      line({
        type: 'user',
        uuid: 'u2',
        interruptedMessageId: 'i1',
        message: {
          role: 'user',
          content: [{ type: 'text', text: '[Request interrupted by user]' }]
        }
      })
    )
    await vi.waitFor(() => expect(onTurnEnded).toHaveBeenCalledTimes(1), { timeout: 5_000 })
    console.log('interrupt seen after ms', Date.now() - started)
    stop()
  })
})
