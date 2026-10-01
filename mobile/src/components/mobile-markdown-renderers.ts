import { createContext, type ReactNode } from 'react'

/** A closed fence's own renderer, or null to keep it as code. */
export type MobileMarkdownFenceRenderer = (
  fence: { language: string | undefined; text: string },
  codeBlock: ReactNode,
  key: string
) => ReactNode | null

/** An inline link's own renderer, or null for the default link. */
export type MobileMarkdownLinkRenderer = (
  href: string,
  label: string,
  key: string
) => ReactNode | null

export type MobileMarkdownRenderers = {
  renderFence?: MobileMarkdownFenceRenderer
  renderLink?: MobileMarkdownLinkRenderer
}

// A context rather than imports, so only the surface that provides one (native chat) pulls its
// renderers into the bundle; every other Markdown screen keeps code as code.
export const MobileMarkdownRenderersContext = createContext<MobileMarkdownRenderers>({})
