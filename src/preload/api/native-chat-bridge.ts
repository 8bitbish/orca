import { ipcRenderer } from 'electron'
import type {
  NativeChatAppendedPayload,
  NativeChatReadSessionResult,
  NativeChatSubscriptionFrame,
  PreloadApi
} from '../api-types'
import type { AgentType } from '../../shared/agent-status/contracts/agent-status-types'
import {
  NATIVE_CHAT_VISUAL_GUEST_THEME_PUBLISH,
  type NativeChatVisualTheme
} from '../../shared/native-chat/native-chat-visual-shell'
import type { NativeChatSlackImageRequest } from '../../shared/native-chat-slack-image-contract'
import type { NativeChatSlackNamesRequest } from '../../shared/native-chat-slack-names-contract'
import type { NativeChatLinkPreviewRequest } from '../../shared/native-chat-link-preview-contract'
import type {
  NativeChatProofImageRequest,
  NativeChatProofVideoRequest
} from '../../shared/native-chat-proof-media-contract'

export const nativeChatApi = {
  // Acknowledge the in-memory snapshot before guest creation can start its preload.
  publishVisualGuestTheme: (theme: NativeChatVisualTheme): void => {
    ipcRenderer.sendSync(NATIVE_CHAT_VISUAL_GUEST_THEME_PUBLISH, theme)
  },
  readSession: (
    agent: AgentType,
    sessionId: string,
    limit?: number,
    transcriptPath?: string,
    options?: { wakeWslDistro?: boolean }
  ): Promise<NativeChatReadSessionResult> =>
    ipcRenderer.invoke('nativeChat:readSession', {
      agent,
      sessionId,
      limit,
      transcriptPath,
      wakeWslDistro: options?.wakeWslDistro
    }),
  subscribe: (
    args: {
      subscriptionId: string
      agent: AgentType
      sessionId: string
      transcriptPath?: string
      limit?: number
      wakeWslDistro?: boolean
    },
    onFrame: (frame: NativeChatSubscriptionFrame) => void
  ): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: NativeChatAppendedPayload) => {
      if (payload.subscriptionId === args.subscriptionId) {
        onFrame(payload.frame)
      }
    }
    ipcRenderer.on('nativeChat:appended', listener)
    ipcRenderer.send('nativeChat:subscribe', args)
    return () => {
      ipcRenderer.removeListener('nativeChat:appended', listener)
      ipcRenderer.send('nativeChat:unsubscribe', { subscriptionId: args.subscriptionId })
    }
  },
  slackImage: (request: NativeChatSlackImageRequest) =>
    ipcRenderer.invoke('nativeChat:slackImage', request),
  slackNames: (request: NativeChatSlackNamesRequest) =>
    ipcRenderer.invoke('nativeChat:slackNames', request),
  linkPreview: (request: NativeChatLinkPreviewRequest) =>
    ipcRenderer.invoke('nativeChat:linkPreview', request),
  openSlack: (href: string): Promise<boolean> => ipcRenderer.invoke('nativeChat:openSlack', href),
  proofImage: (request: NativeChatProofImageRequest) =>
    ipcRenderer.invoke('nativeChat:proofImage', request),
  proofVideo: (request: NativeChatProofVideoRequest) =>
    ipcRenderer.invoke('nativeChat:proofVideo', request),
  getConversationNameFailureOutput: (sessionId: string): Promise<string | null> =>
    ipcRenderer.invoke('nativeChat:conversationNameFailureOutput', sessionId)
} satisfies PreloadApi['nativeChat']
