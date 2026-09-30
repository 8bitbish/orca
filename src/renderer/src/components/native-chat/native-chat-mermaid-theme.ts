// Mermaid's `base` theme fed from the app's own tokens, so a diagram in a reply
// reads as part of the monochrome chrome in light and dark alike. Mermaid derives
// shades from these with its color library, which needs literal colors: a token
// whose value is not plain hex (a user theme, a var() reference) drops the whole
// theme back to Mermaid's stock one rather than feeding it something it misreads.

type MermaidThemeVariables = Record<string, string | boolean>

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i

const TOKENS = [
  '--background',
  '--card',
  '--foreground',
  '--muted',
  '--muted-foreground',
  '--accent',
  '--ring',
  '--primary-foreground'
] as const

type TokenName = (typeof TOKENS)[number]

export function nativeChatMermaidThemeVariables(
  readToken: (token: string) => string,
  isDark: boolean
): MermaidThemeVariables | null {
  const values = new Map<TokenName, string>()
  for (const token of TOKENS) {
    const value = readToken(token).trim()
    if (!HEX_COLOR.test(value)) {
      return null
    }
    values.set(token, value)
  }
  const token = (name: TokenName): string => values.get(name) ?? ''
  const fontFamily = readToken('--app-font-family').trim()
  const foreground = token('--foreground')
  const node = token('--muted')
  const nodeBorder = token('--ring')
  const line = token('--muted-foreground')
  const surface = token('--card')
  return {
    darkMode: isDark,
    background: surface,
    ...(fontFamily ? { fontFamily } : {}),
    fontSize: '13px',
    primaryColor: node,
    primaryTextColor: foreground,
    primaryBorderColor: nodeBorder,
    secondaryColor: token('--accent'),
    secondaryTextColor: foreground,
    secondaryBorderColor: nodeBorder,
    tertiaryColor: token('--background'),
    tertiaryTextColor: foreground,
    tertiaryBorderColor: nodeBorder,
    mainBkg: node,
    nodeBorder,
    nodeTextColor: foreground,
    textColor: foreground,
    titleColor: foreground,
    lineColor: line,
    clusterBkg: token('--background'),
    clusterBorder: nodeBorder,
    edgeLabelBackground: surface,
    noteBkgColor: token('--accent'),
    noteTextColor: foreground,
    noteBorderColor: nodeBorder,
    actorBkg: node,
    actorBorder: nodeBorder,
    actorTextColor: foreground,
    actorLineColor: line,
    signalColor: foreground,
    signalTextColor: foreground,
    labelBoxBkgColor: node,
    labelBoxBorderColor: nodeBorder,
    labelTextColor: foreground,
    loopTextColor: foreground,
    activationBkgColor: token('--accent'),
    activationBorderColor: nodeBorder,
    sequenceNumberColor: token('--primary-foreground')
  }
}
