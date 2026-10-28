import { defineMethod } from '../core'
import { NativeChatLinkPreview } from '../../../../shared/rpc-contract/native-chat-link-preview-params'
import { fetchNativeChatLinkPreview } from '../../../native-chat/link-preview-fetch'

export const NATIVE_CHAT_LINK_PREVIEW_METHODS = [
  defineMethod({
    name: 'nativeChat.linkPreview',
    permission: 'workspace',
    params: NativeChatLinkPreview,
    // An old host answers method_not_found; clients then draw the card from its own fields.
    handler: async (params) => fetchNativeChatLinkPreview(params)
  })
]
