import { ipcMain } from 'electron'
import { isNativeChatCardRecord } from '../../shared/native-chat-card-actions'
import type {
  NativeChatProofImageReply,
  NativeChatProofVideoReply
} from '../../shared/native-chat-proof-media-contract'
import { readProofImage, readProofVideo } from '../native-chat/proof-media'

function field(args: unknown, key: string): unknown {
  return isNativeChatCardRecord(args) ? args[key] : undefined
}

// Desktop side of proof cards: media from this Mac's ~/.orca-personal/proof/ only.
// Image thumbnails go through the Slack card image codec registered at startup.
export function registerNativeChatProofHandlers(): void {
  ipcMain.handle(
    'nativeChat:proofImage',
    async (_event, args: unknown): Promise<NativeChatProofImageReply> => {
      const variant = field(args, 'variant')
      if (variant !== 'thumbnail' && variant !== 'full') {
        return { ok: false, reason: 'invalid-path' }
      }
      return readProofImage({ path: field(args, 'path'), variant })
    }
  )
  ipcMain.handle(
    'nativeChat:proofVideo',
    async (_event, args: unknown): Promise<NativeChatProofVideoReply> =>
      readProofVideo({ path: field(args, 'path') })
  )
}
