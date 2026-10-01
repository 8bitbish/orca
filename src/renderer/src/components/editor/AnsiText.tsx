import type { ITheme } from '@xterm/xterm'
import {
  DEFAULT_TERMINAL_THEME_DARK,
  DEFAULT_TERMINAL_THEME_LIGHT,
  getBuiltinTheme
} from '@/lib/terminal-theme'
import { parseAnsiSegments, type AnsiColor } from './ipynb-ansi'
import { useDocumentDarkTheme } from './use-document-dark-theme'

const ANSI_PALETTE_KEYS = [
  'black',
  'red',
  'green',
  'yellow',
  'blue',
  'magenta',
  'cyan',
  'white',
  'brightBlack',
  'brightRed',
  'brightGreen',
  'brightYellow',
  'brightBlue',
  'brightMagenta',
  'brightCyan',
  'brightWhite'
] as const satisfies readonly (keyof ITheme)[]

// Why: the default terminal themes already carry ANSI palettes tuned for Orca's dark and light surfaces.
const ANSI_PALETTES = {
  dark: ANSI_PALETTE_KEYS.map((key) => getBuiltinTheme(DEFAULT_TERMINAL_THEME_DARK)?.[key]),
  light: ANSI_PALETTE_KEYS.map((key) => getBuiltinTheme(DEFAULT_TERMINAL_THEME_LIGHT)?.[key])
}

/** Terminal output as styled spans: SGR colours from the default terminal palette,
 *  every other escape dropped. Read-only text, no terminal behind it. */
export function AnsiText({ text }: { text: string }): React.JSX.Element {
  const palette = ANSI_PALETTES[useDocumentDarkTheme() ? 'dark' : 'light']
  const resolve = (color: AnsiColor | undefined): string | undefined =>
    typeof color === 'number' ? palette[color] : color
  return (
    <>
      {parseAnsiSegments(text).map((segment, index) => (
        <span
          key={index}
          style={{
            color: resolve(segment.fg),
            backgroundColor: resolve(segment.bg),
            fontWeight: segment.bold ? 600 : undefined,
            fontStyle: segment.italic ? 'italic' : undefined,
            textDecoration: segment.underline ? 'underline' : undefined
          }}
        >
          {segment.text}
        </span>
      ))}
    </>
  )
}
