// Desktop's style kit: the shared rules plus the Geist face they name, inlined by Vite.

import geistFontDataUrl from '@/assets/fonts/Geist-Variable.woff2?inline'
import { NATIVE_CHAT_MARKUP_STYLE_KIT_RULES } from '../../../../shared/native-chat-markup-style-kit'

const FONT_FACE = `@font-face{font-family:'Geist';src:url(${geistFontDataUrl}) format('woff2');font-weight:100 900;font-display:block}`

export const NATIVE_CHAT_MARKUP_STYLE_KIT = FONT_FACE + NATIVE_CHAT_MARKUP_STYLE_KIT_RULES
