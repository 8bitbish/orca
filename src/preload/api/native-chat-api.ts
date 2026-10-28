import type {
  NativeChatLinkPreviewRequest,
  NativeChatLinkPreviewResult
} from '../../shared/native-chat-link-preview-contract'
import type {
  AgentType,
  NativeChatMessage,
  NativeChatTurnLifecycle
} from '../../shared/native-chat-types'
import type {
  NativeChatSlackImageRequest,
  NativeChatSlackImageResult
} from '../../shared/native-chat-slack-image-contract'
import type {
  NativeChatSlackNamesRequest,
  NativeChatSlackNamesResult
} from '../../shared/native-chat-slack-names-contract'
import type {
  NativeChatProofImageReply,
  NativeChatProofImageRequest,
  NativeChatProofVideoReply,
  NativeChatProofVideoRequest
} from '../../shared/native-chat-proof-media-contract'

// notFound marks a not-yet-on-disk miss (retry-worthy) vs a real read/parse error (#8401).
export type NativeChatReadSessionResult =
  | {
      messages: NativeChatMessage[]
      lifecycle?: NativeChatTurnLifecycle
    }
  | { error: string; notFound?: true }

export type NativeChatAppendedMessages = NativeChatMessage[]

export type NativeChatSubscriptionFrame =
  | {
      type: 'snapshot'
      messages: NativeChatMessage[]
      hasMore: boolean
      error?: string
      lifecycle?: NativeChatTurnLifecycle
      /** No transcript yet; do not treat this frame as settled session history. */
      pending?: boolean
    }
  | {
      type: 'replacement'
      messages: NativeChatMessage[]
      hasMore: boolean
      lifecycle?: NativeChatTurnLifecycle
    }
  | {
      type: 'appended'
      messages: NativeChatMessage[]
      lifecycle?: NativeChatTurnLifecycle
    }

export type NativeChatAppendedPayload = {
  subscriptionId: string
  frame: NativeChatSubscriptionFrame
}

export type NativeChatSubscribeArgs = {
  /** Unique per caller to isolate live panes sharing a renderer. */
  subscriptionId: string
  agent: AgentType
  sessionId: string
  /** Authoritative transcript path from the agent hook (providerSession). */
  transcriptPath?: string
  /** First snapshot size; later readSession calls grow this for pagination. */
  limit?: number
}

export type NativeChatApi = {
  /** Reads the latest limit turns; the hook-reported transcriptPath takes precedence over ID globbing. */
  readSession: (
    agent: AgentType,
    sessionId: string,
    limit?: number,
    transcriptPath?: string
  ) => Promise<NativeChatReadSessionResult>
  /** First frame is a bounded snapshot; later frames contain only appended messages. */
  subscribe: (
    args: NativeChatSubscribeArgs,
    onFrame: (frame: NativeChatSubscriptionFrame) => void
  ) => () => void
  /** A Slack card image from the slack-mcp cache on the chat's host; null when refused,
   *  missing, or the host predates the call. */
  slackImage: (request: NativeChatSlackImageRequest) => Promise<NativeChatSlackImageResult | null>
  /** Names for unlabelled mention ids from the slack-mcp cache on the chat's host. */
  slackNames: (request: NativeChatSlackNamesRequest) => Promise<NativeChatSlackNamesResult>
  /** A link card's page preview, fetched by the chat's host; null when nothing loaded,
   *  or the host predates the call. */
  linkPreview: (
    request: NativeChatLinkPreviewRequest
  ) => Promise<NativeChatLinkPreviewResult | null>
  /** Opens a Slack chip href (`slack-user:` etc.) in Slack; false when nothing opened. */
  openSlack: (href: string) => Promise<boolean>
  /** A proof card image from ~/.orca-personal/proof/ on this machine. */
  proofImage: (request: NativeChatProofImageRequest) => Promise<NativeChatProofImageReply>
  /** A proof card recording's bytes from ~/.orca-personal/proof/ on this machine. */
  proofVideo: (request: NativeChatProofVideoRequest) => Promise<NativeChatProofVideoReply>
  /** A local structured chat's last failed naming output; null when none or not local. */
  getConversationNameFailureOutput: (sessionId: string) => Promise<string | null>
}
