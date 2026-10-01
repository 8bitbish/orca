import type { NativeChatMarkupKind } from '../../../../src/shared/native-chat-markup-preview-policy'

export function mobileMarkupPreviewKind(language: string | undefined): NativeChatMarkupKind | null {
  const normalized = language?.toLowerCase()
  return normalized === 'html' || normalized === 'svg' || normalized === 'widget'
    ? normalized
    : null
}
