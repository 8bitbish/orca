import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { runProcessSync } from './child-process/run-process'
import {
  buildNativeChatShellRunCommandLine,
  createNativeChatShellRunMarkerScanner,
  type NativeChatShellRunMarkerEvent
} from './native-chat-shell-run-command'

const RUN_ID = 'abc123def456'
const START = `\u001b]777;orca-chat-run-start;${RUN_ID}\u0007`
const end = (code: number): string => `\u001b]777;orca-chat-run-end;${RUN_ID};${code}\u0007`

function scanAll(chunks: string[]): NativeChatShellRunMarkerEvent[] {
  const scanner = createNativeChatShellRunMarkerScanner(RUN_ID)
  const events = chunks.flatMap((chunk) => scanner.push(chunk))
  // Adjacent output events are one stream; merge them so chunking does not matter.
  return events.reduce<NativeChatShellRunMarkerEvent[]>((merged, event) => {
    const last = merged.at(-1)
    if (event.type === 'output' && last?.type === 'output') {
      merged[merged.length - 1] = { type: 'output', data: last.data + event.data }
    } else {
      merged.push(event)
    }
    return merged
  }, [])
}

describe('buildNativeChatShellRunCommandLine', () => {
  it('quotes nothing a shell would expand and leaves the line out of history', () => {
    const line = buildNativeChatShellRunCommandLine({
      script: 'echo \'hi\' && rm -rf "$HOME"; echo `x` !!',
      interpreter: 'bash',
      cwd: "/tmp/it's here",
      runId: RUN_ID
    })
    expect(line.startsWith(' sh -c ')).toBe(true)
    const quoted = line.slice(line.indexOf("'") + 1, line.lastIndexOf("'"))
    expect(quoted).not.toContain("'")
    expect(quoted).not.toContain('!')
    const args = line
      .slice(line.lastIndexOf("'") + 1)
      .trim()
      .split(' ')
    expect(args[0]).toBe('orca-chat-run')
    for (const arg of args) {
      expect(arg).toMatch(/^[A-Za-z0-9+/=-]+$/)
    }
  })

  it('refuses a run id that could break out of the line', () => {
    expect(() =>
      buildNativeChatShellRunCommandLine({
        script: 'ls',
        interpreter: 'sh',
        cwd: '/',
        runId: "x'; rm"
      })
    ).toThrow()
  })

  it.runIf(process.platform !== 'win32')(
    'runs the block in the workspace under its shell and reports its own exit code',
    () => {
      const dir = mkdtempSync(path.join(os.tmpdir(), 'orca-chat-run-'))
      try {
        const line = buildNativeChatShellRunCommandLine({
          script: 'pwd\necho "out: é"\nexit 3',
          interpreter: 'sh',
          cwd: dir,
          runId: RUN_ID
        })
        const result = runProcessSync({ program: '/bin/sh', args: ['-c', line] })
        const events = scanAll([result.stdout])
        expect(events[0]).toEqual({ type: 'start' })
        expect(events.at(-1)).toEqual({ type: 'end', exitCode: 3 })
        const output = events.find((event) => event.type === 'output')
        expect(output?.type === 'output' ? output.data : '').toContain('out: é')
        expect(output?.type === 'output' ? output.data : '').toContain(path.basename(dir))
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    }
  )

  it.runIf(process.platform !== 'win32')('fails without running when the folder is gone', () => {
    const line = buildNativeChatShellRunCommandLine({
      script: 'echo should-not-run',
      interpreter: 'sh',
      cwd: '/definitely/not/here',
      runId: RUN_ID
    })
    const result = runProcessSync({ program: '/bin/sh', args: ['-c', line] })
    expect(result.stdout).not.toContain('should-not-run')
    expect(scanAll([result.stdout]).at(-1)).toEqual({ type: 'end', exitCode: 1 })
  })
})

describe('createNativeChatShellRunMarkerScanner', () => {
  it('drops the echoed command line and prompt before the start marker', () => {
    expect(
      scanAll(['% sh -c ... orca-chat-run-start;abc\r\n', START, 'hello\r\n', end(0), '% '])
    ).toEqual([
      { type: 'start' },
      { type: 'output', data: 'hello\r\n' },
      { type: 'end', exitCode: 0 }
    ])
  })

  it('finds markers split across chunks at every byte', () => {
    const stream = `prompt ${START}line 1\r\nline 2\r\n${end(130)}% `
    for (let cut = 1; cut < stream.length; cut += 1) {
      expect(scanAll([stream.slice(0, cut), stream.slice(cut)])).toEqual([
        { type: 'start' },
        { type: 'output', data: 'line 1\r\nline 2\r\n' },
        { type: 'end', exitCode: 130 }
      ])
    }
  })

  it('ignores another run’s markers', () => {
    const other = '\u001b]777;orca-chat-run-end;zzzzzzzzzzzz;0\u0007'
    expect(scanAll([START, 'a', other, 'b', end(2)])).toEqual([
      { type: 'start' },
      { type: 'output', data: `a${other}b` },
      { type: 'end', exitCode: 2 }
    ])
  })

  it('accepts ST as the OSC terminator', () => {
    const st = `\u001b]777;orca-chat-run-start;${RUN_ID}\u001b\\`
    expect(scanAll([st, 'x', `\u001b]777;orca-chat-run-end;${RUN_ID};1\u001b\\`])).toEqual([
      { type: 'start' },
      { type: 'output', data: 'x' },
      { type: 'end', exitCode: 1 }
    ])
  })
})
