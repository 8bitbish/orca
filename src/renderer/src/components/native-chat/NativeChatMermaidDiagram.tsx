import { useMemo } from 'react'
import MermaidBlock from '@/components/editor/MermaidBlock'
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
  return (
    // Sanitized SVG labels need no foreignObject; MermaidBlock falls back to source on a parse error.
    <div className="min-w-0 overflow-x-auto p-3 [&_.mermaid-block]:min-w-0 [&_.mermaid-block_pre]:my-0 [&_.mermaid-block_pre]:max-h-80 [&_.mermaid-block_pre]:overflow-x-auto [&_.mermaid-block_pre]:font-mono [&_.mermaid-block_pre]:text-[12px] [&_.mermaid-block_svg]:mx-auto [&_.mermaid-block_svg]:block">
      <MermaidBlock
        content={source}
        isDark={isDark}
        htmlLabels={false}
        themeVariables={themeVariables}
      />
    </div>
  )
}
