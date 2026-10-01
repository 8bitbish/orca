// A run's output as a terminal would draw it. Programs redraw with carriage returns
// and cursor moves (progress bars, pnpm, docker), so the raw stream is played into an
// xterm that is never opened — no DOM, no input — and read back as lines with SGR
// colours for the inline pane.

import { Terminal } from '@xterm/xterm'
import { SerializeAddon } from '@xterm/addon-serialize'

export type NativeChatShellRunScreen = {
  /** Resolves once xterm has parsed `data`. */
  write: (data: string) => Promise<void>
  /** Everything on screen and in scrollback, `\n`-separated, with SGR colours. */
  text: () => string
  /** The line the cursor sits on, without styling: where a prompt waits. */
  cursorLine: () => string
  dispose: () => void
}

// The Runs terminal is spawned at 120 columns; matching it keeps cursor moves aligned.
const COLUMNS = 120
const ROWS = 40
const SCROLLBACK = 1000
// oxlint-disable-next-line no-control-regex -- matches the ESC byte of the serializer's cursor-forward gaps.
const CURSOR_FORWARD = /\u001b\[(\d*)C/g
// oxlint-disable-next-line no-control-regex -- matches the ESC byte of every CSI but SGR (`m`).
const NON_SGR_CSI = /\u001b\[[\d;?]*[@A-Za-ln-z]/g

export function createNativeChatShellRunScreen(): NativeChatShellRunScreen {
  const terminal = new Terminal({
    cols: COLUMNS,
    rows: ROWS,
    scrollback: SCROLLBACK,
    allowProposedApi: true,
    disableStdin: true
  })
  const serializer = new SerializeAddon()
  terminal.loadAddon(serializer)
  return {
    write: (data) => new Promise((resolve) => terminal.write(data, resolve)),
    text: () =>
      serializer
        .serialize({ excludeModes: true, excludeAltBuffer: true })
        .replace(/\r\n/g, '\n')
        // The serializer writes runs of blank cells as cursor moves; the pane needs the spaces.
        .replace(CURSOR_FORWARD, (_match, count: string) => ' '.repeat(Number(count || '1')))
        .replace(NON_SGR_CSI, '')
        .replace(/\n+$/, ''),
    cursorLine: () => {
      const buffer = terminal.buffer.active
      return buffer.getLine(buffer.baseY + buffer.cursorY)?.translateToString(true) ?? ''
    },
    dispose: () => terminal.dispose()
  }
}
