import { subscribeNativeChatTranscript } from '../native-chat/transcript-watch'
import type { TerminalMessageQueueTranscriptWatch } from './terminal-message-queue-host'

/**
 * Watches a session transcript for the provider's own interrupt marker.
 *
 * Only `interrupted` is read. Claude Code sends no hook when a turn is cancelled, so this marker is
 * the host's only proof that Stop worked. Completion stays with the status rows: a Claude text row
 * written before a tool call can decode as `completed`, which must never release the queue mid-turn.
 */
export const watchTranscriptForInterrupts: TerminalMessageQueueTranscriptWatch = (
  session,
  onTurnEnded
) => {
  let lastTurnId: string | null = null
  let closed = false
  const setup = new AbortController()
  const subscription = subscribeNativeChatTranscript(
    {
      agent: session.agent,
      sessionId: session.sessionId,
      ...(session.transcriptPath ? { transcriptPath: session.transcriptPath } : {}),
      initialLimit: 1,
      onInitialSnapshot: (_messages, _hasMore, _beforeOffset, _error, lifecycle) => {
        // A marker already on disk ended an earlier turn; only later ones are news.
        lastTurnId = lifecycle?.turnId ?? null
      },
      onReplace: (_messages, _hasMore, _beforeOffset, lifecycle) => {
        lastTurnId = lifecycle?.turnId ?? lastTurnId
      },
      onAppend: (_messages, lifecycle) => {
        if (closed || !lifecycle || lifecycle.turnId === lastTurnId) {
          return
        }
        lastTurnId = lifecycle.turnId
        if (lifecycle.state === 'interrupted') {
          onTurnEnded()
        }
      }
    },
    setup.signal
  )
  subscription
    .then((active) => {
      if (closed) {
        active.unsubscribe()
      }
    })
    .catch((error: unknown) => {
      console.warn('[terminal-message-queue] transcript watch failed', error)
    })
  return () => {
    closed = true
    setup.abort()
    void subscription.then((active) => active.unsubscribe()).catch(() => {})
  }
}
