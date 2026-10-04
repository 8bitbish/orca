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

/** Messages appended to a live-tailed transcript since the previous emit. */
export type NativeChatAppendedMessages = NativeChatMessage[]

export type NativeChatSubscriptionFrame =
  | {
      type: 'snapshot'
      messages: NativeChatMessage[]
      hasMore: boolean
      error?: string
      lifecycle?: NativeChatTurnLifecycle
      /** No transcript exists behind this window yet — render it, but do not
       *  treat it as a settled read of the session's history. */
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

/** Wire payload for the `nativeChat:appended` push channel. */
export type NativeChatAppendedPayload = {
  subscriptionId: string
  frame: NativeChatSubscriptionFrame
}

export type NativeChatSubscribeArgs = {
  /** Unique per-caller id, echoed on every append so multiple live panes in
   *  one renderer don't cross-talk. */
  subscriptionId: string
  agent: AgentType
  sessionId: string
  /** Authoritative transcript path from the agent hook (providerSession). */
  transcriptPath?: string
  /** First snapshot size; later readSession calls grow this for pagination. */
  limit?: number
}

export type NativeChatApi = {
  /** Read the on-disk transcript for an agent + session id, windowed to the most recent `limit`
   *  turns. `transcriptPath` is the hook-reported authoritative path, preferred over the id glob. */
  readSession: (
    agent: AgentType,
    sessionId: string,
    limit?: number,
    transcriptPath?: string
  ) => Promise<NativeChatReadSessionResult>
  /** Live-tail a transcript. The first frame is a bounded race-safe snapshot;
   *  later frames contain only newly appended messages. */
  subscribe: (
    args: NativeChatSubscribeArgs,
    onFrame: (frame: NativeChatSubscriptionFrame) => void
  ) => () => void
  /** A Slack card image from the slack-mcp cache on the chat's host; null when refused,
   *  missing, or the host predates the call. */
  slackImage: (request: NativeChatSlackImageRequest) => Promise<NativeChatSlackImageResult | null>
  /** Opens a Slack chip href (`slack-user:` etc.) in Slack; false when nothing opened. */
  openSlack: (href: string) => Promise<boolean>
  /** A proof card image from ~/.orca-personal/proof/ on this machine. */
  proofImage: (request: NativeChatProofImageRequest) => Promise<NativeChatProofImageReply>
  /** A proof card recording's bytes from ~/.orca-personal/proof/ on this machine. */
  proofVideo: (request: NativeChatProofVideoRequest) => Promise<NativeChatProofVideoReply>
}
