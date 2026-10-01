import {
  NATIVE_CHAT_MARKUP_BASE_STYLES,
  NATIVE_CHAT_MARKUP_KIND_STYLES,
  nativeChatMarkupPreviewCsp,
  type NativeChatMarkupKind
} from '../../../../src/shared/native-chat-markup-preview-policy'
import { NATIVE_CHAT_MARKUP_STYLE_KIT_RULES } from '../../../../src/shared/native-chat-markup-style-kit'
import { colors } from '../../theme/mobile-theme'
import {
  MARKUP_PREVIEW_ENGINE_HASH,
  MARKUP_PREVIEW_ENGINE_JS
} from './markup-preview-engine.generated'

// The desktop token names the style kit reads, filled from the (dark-only) mobile palette.
const TOKEN_CSS = Object.entries({
  '--background': colors.bgBase,
  '--foreground': colors.textPrimary,
  '--card': colors.bgRaised,
  '--muted': colors.bgPanel,
  '--muted-foreground': colors.textSecondary,
  '--border': colors.borderSubtle,
  '--primary': colors.surfaceBright,
  '--primary-foreground': colors.bgBase,
  '--destructive': colors.statusRed,
  '--status-success': colors.statusGreen,
  '--status-warning': colors.statusAmber
})
  .map(([name, value]) => `${name}:${value}`)
  .join(';')

// JSON leaves `<`, `>`, `&` and U+2028/9 raw; escaped, `</script>` in the markup cannot end the block.
function encodeJsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(
    /[<>&\u2028\u2029]/g,
    (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`
  )
}

/** The preview page: agent markup rides in an inert JSON block, and the CSP admits
 *  only the bundled engine, which sanitizes it into the body. */
export function buildMobileMarkupPreviewDocument(
  source: string,
  kind: NativeChatMarkupKind
): string {
  return (
    '<!doctype html>' +
    '<html class="dark"><head><meta charset="utf-8">' +
    `<meta http-equiv="Content-Security-Policy" content="${nativeChatMarkupPreviewCsp(`'${MARKUP_PREVIEW_ENGINE_HASH}'`)}">` +
    '<meta name="color-scheme" content="dark">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    `<style>:root{${TOKEN_CSS}}${NATIVE_CHAT_MARKUP_BASE_STYLES}${NATIVE_CHAT_MARKUP_STYLE_KIT_RULES}${NATIVE_CHAT_MARKUP_KIND_STYLES[kind]}</style>` +
    `<script type="application/json" id="orca-markup-source">${encodeJsonForScript({ source })}</script>` +
    `<script>${MARKUP_PREVIEW_ENGINE_JS}</script>` +
    '</head><body></body></html>'
  )
}
