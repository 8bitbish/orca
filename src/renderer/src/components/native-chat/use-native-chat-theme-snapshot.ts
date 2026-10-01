import { useMemo } from 'react'
import {
  buildPanelDesignTokenCss,
  currentPanelColorScheme
} from '@/components/right-sidebar/plugin-panel-design-token-css'
import { usePluginPanelThemeRevision } from '@/components/right-sidebar/use-plugin-panel-theme-revision'
import { PANEL_DESIGN_TOKEN_ALLOWLIST } from '../../../../shared/plugins/plugin-panel-shell'

/** The plugin panel's curated set, plus the status hues the widget style kit's
 *  positive/warning marks read. */
const NATIVE_CHAT_PREVIEW_TOKENS: readonly string[] = [
  ...PANEL_DESIGN_TOKEN_ALLOWLIST,
  '--status-success',
  '--status-warning'
]

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
      tokenCss: buildPanelDesignTokenCss(NATIVE_CHAT_PREVIEW_TOKENS),
      readToken: (token: string) => styles.getPropertyValue(token)
    }
  }, [revision])
}
