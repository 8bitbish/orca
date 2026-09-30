declare module 'mermaid' {
  type MermaidTheme = 'default' | 'dark' | 'base'

  type MermaidInitializeOptions = {
    startOnLoad?: boolean
    theme?: MermaidTheme
    /** Palette overrides; honored in full only by the `base` theme. */
    themeVariables?: Record<string, string | boolean>
    htmlLabels?: boolean
    securityLevel?: 'strict' | 'loose' | 'antiscript' | 'sandbox'
    suppressErrorRendering?: boolean
  }

  type MermaidRenderResult = {
    svg: string
    bindFunctions?: (element: Element) => void
  }

  type MermaidApi = {
    initialize: (options: MermaidInitializeOptions) => void
    render: (id: string, text: string) => Promise<MermaidRenderResult>
  }

  const mermaid: MermaidApi
  export default mermaid
}
