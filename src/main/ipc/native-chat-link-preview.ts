import { ipcMain } from 'electron'
import { fetchNativeChatLinkPreview } from '../native-chat/link-preview-fetch'
import type { NativeChatLinkPreviewResult } from '../../shared/native-chat-link-preview-contract'

// Desktop side of link cards: the page preview is fetched here, never by the renderer.
export function registerNativeChatLinkPreviewHandlers(): void {
  ipcMain.handle(
    'nativeChat:linkPreview',
    async (_event, args: unknown): Promise<NativeChatLinkPreviewResult | null> => {
      const request = typeof args === 'object' && args !== null ? args : {}
      const url = 'url' in request ? request.url : undefined
      const image = 'image' in request ? request.image : undefined
      if (typeof url !== 'string' || (image !== undefined && typeof image !== 'string')) {
        return null
      }
      return fetchNativeChatLinkPreview(image === undefined ? { url } : { url, image })
    }
  )
}
