import { afterEach, expect, it } from 'vitest'
import { HeadlessEmulator } from './headless-emulator'
import { projectTerminalTailLines, projectTerminalVisibleLines } from './terminal-screen-projection'

let emulator: HeadlessEmulator | null = null

afterEach(() => {
  emulator?.dispose()
  emulator = null
})

async function screen(ansi: string): Promise<HeadlessEmulator> {
  emulator = new HeadlessEmulator({ cols: 80, rows: 24 })
  await emulator.write(ansi)
  return emulator
}

// Deliberately reverses upstream (419e3b4496): Claude Code's dim (SGR 2) prompt suggestion is the
// agent's, so a read reports it as `suggestion`, never as the typed `draft`, and keeps it out of lines.
it('reports a dim prompt suggestion apart from the draft and the screen lines', async () => {
  const projected = projectTerminalVisibleLines(
    await screen(
      '\x1b[?1049hBuild passed\r\n────────\r\n❯ \x1b[2mproceed with the release\x1b[22m\x1b[3G'
    )
  )

  expect(projected.lines).toEqual(['Build passed', '────────', '❯'])
  expect(projected.suggestion).toBe('proceed with the release')
  expect(projected.draft).toBeUndefined()
})

it('reports only the typed text of a draft, not its dim completion', async () => {
  const projected = projectTerminalTailLines(
    await screen('\x1b[?1049hBuild passed\r\n────────\r\n❯ /comp\x1b[2mact\x1b[22m\x1b[8G'),
    50
  )

  expect(projected.lines).toEqual(['Build passed', '────────', '❯'])
  expect(projected.draft).toBe('/comp')
  expect(projected.suggestion).toBeUndefined()
})
