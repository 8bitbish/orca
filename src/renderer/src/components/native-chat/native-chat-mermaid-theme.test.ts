import { describe, expect, it } from 'vitest'
import { nativeChatMermaidThemeVariables } from './native-chat-mermaid-theme'

const LIGHT: Record<string, string> = {
  '--background': '#fff',
  '--card': '#fff',
  '--foreground': '#0a0a0a',
  '--muted': '#f5f5f5',
  '--muted-foreground': '#737373',
  '--accent': '#f5f5f5',
  '--ring': '#a1a1a1',
  '--primary-foreground': '#fafafa',
  '--app-font-family': "'Geist', sans-serif"
}

describe('nativeChatMermaidThemeVariables', () => {
  it('maps the app tokens onto the base theme', () => {
    const variables = nativeChatMermaidThemeVariables((token) => LIGHT[token] ?? '', false)
    expect(variables).toMatchObject({
      darkMode: false,
      background: '#fff',
      primaryColor: '#f5f5f5',
      primaryTextColor: '#0a0a0a',
      lineColor: '#737373',
      nodeBorder: '#a1a1a1',
      fontFamily: "'Geist', sans-serif"
    })
  })

  it('falls back to the stock theme when a token is not a literal color', () => {
    const read = (token: string): string =>
      token === '--muted' ? 'var(--color-neutral-100)' : (LIGHT[token] ?? '')
    expect(nativeChatMermaidThemeVariables(read, true)).toBeNull()
  })
})
