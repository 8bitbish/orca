import { useMemo } from 'react'
import MermaidBlock, { type RenderedMermaidDiagram } from '@/components/editor/MermaidBlock'
import { useAppStore } from '@/store'
import { nativeChatMermaidThemeVariables } from './native-chat-mermaid-theme'
import { useNativeChatThemeSnapshot } from './use-native-chat-theme-snapshot'

/** The editor's Mermaid renderer, painted in the app's tokens for this theme. */
export function NativeChatMermaidDiagram({ source }: { source: string }): React.JSX.Element {
  const theme = useNativeChatThemeSnapshot()
  const isDark = theme.colorScheme === 'dark'
  const themeVariables = useMemo(
    () => nativeChatMermaidThemeVariables(theme.readToken, isDark) ?? undefined,
    [isDark, theme]
  )
  const openModal = useAppStore((s) => s.openModal)
  const expand = (diagram: RenderedMermaidDiagram): void => openModal('diagram-viewer', diagram)
  return (
    // Sanitized SVG labels need no foreignObject; MermaidBlock falls back to source on a parse error.
    <div className="min-w-0 overflow-x-auto p-3 [&_.mermaid-block]:min-w-0 [&_.mermaid-block_pre]:my-0 [&_.mermaid-block_pre]:max-h-80 [&_.mermaid-block_pre]:overflow-x-auto [&_.mermaid-block_pre]:font-mono [&_.mermaid-block_pre]:text-chat-code [&_.mermaid-block_svg]:mx-auto [&_.mermaid-block_svg]:block">
      <MermaidBlock
        content={source}
        isDark={isDark}
        htmlLabels={false}
        themeVariables={themeVariables}
        onExpand={expand}
      />
    </div>
  )
}
