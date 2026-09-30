import { useMemo } from 'react'
import {
  buildPanelDesignTokenCss,
  currentPanelColorScheme
} from '@/components/right-sidebar/plugin-panel-design-token-css'
import { usePluginPanelThemeRevision } from '@/components/right-sidebar/use-plugin-panel-theme-revision'

export type NativeChatThemeSnapshot = {
  /** Bumps whenever the baked values below change. */
  revision: number
  colorScheme: 'light' | 'dark'
  /** Curated tokens as `--name:value` declarations, safe to bake into a style block. */
  tokenCss: string
  /** Reads a root custom property as currently declared. */
  readToken: (token: string) => string
}

/** The app theme as diagrams bake it in; a new snapshot only when those values change. */
export function useNativeChatThemeSnapshot(): NativeChatThemeSnapshot {
  const revision = usePluginPanelThemeRevision()
  return useMemo(() => {
    const styles = getComputedStyle(document.documentElement)
    return {
      revision,
      colorScheme: currentPanelColorScheme(),
      tokenCss: buildPanelDesignTokenCss(),
      readToken: (token: string) => styles.getPropertyValue(token)
    }
  }, [revision])
}
