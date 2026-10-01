import { defineMethod } from '../core'
import { NativeChatSlackImage } from '../../../../shared/rpc-contract/native-chat-slack-params'
import { remoteRpcContentBudget } from '../../../../shared/remote-rpc-content-budget'
import {
  readSlackCacheImage,
  SLACK_CACHE_IMAGE_MAX_FILE_BYTES
} from '../../../native-chat/slack-cache-image'

// Base64 inflates 4:3; the rest of the reply (mime, sizes, data: prefix) is small.
const REPLY_OVERHEAD_BYTES = 1024

function maxImageBytes(requestId: string | undefined): number {
  if (!requestId) {
    return SLACK_CACHE_IMAGE_MAX_FILE_BYTES
  }
  const budget = remoteRpcContentBudget(requestId) - REPLY_OVERHEAD_BYTES
  return Math.max(0, Math.floor((budget * 3) / 4))
}

export const NATIVE_CHAT_SLACK_METHODS = [
  defineMethod({
    name: 'nativeChat.slackImage',
    params: NativeChatSlackImage,
    // Null for any refusal: an old host answers method_not_found, and clients show no image either way.
    handler: async (params, { requestId }) => {
      const read = await readSlackCacheImage({
        path: params.path,
        variant: params.variant,
        maxBytes: maxImageBytes(requestId)
      })
      return read.ok ? read.image : null
    }
  })
]
