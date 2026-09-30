import type mermaid from 'mermaid'

type MermaidConfig = Parameters<typeof mermaid.initialize>[0]

export function getMermaidConfig(
  isDark: boolean,
  htmlLabels = false,
  /** A caller's palette on Mermaid's `base` theme; omitted, the stock light/dark themes apply. */
  themeVariables?: MermaidConfig['themeVariables']
): MermaidConfig {
  return {
    startOnLoad: false,
    securityLevel: 'strict',
    suppressErrorRendering: true,
    theme: themeVariables ? 'base' : isDark ? 'dark' : 'default',
    ...(themeVariables ? { themeVariables } : {}),
    htmlLabels
  }
}
