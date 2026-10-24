import { useMemo } from 'react'
import { StyleSheet, View } from 'react-native'
import type { RpcClient } from '../transport/rpc-client'
import type { ConnectionState } from '../transport/types'
import { MobileNativeChatProjectsProvider } from './project-cards/MobileNativeChatProjectsProvider'
import { MobileNativeChatView, type MobileNativeChatInputLockReason } from './MobileNativeChatView'
import { foldMobileNativeChatMessages } from './mobile-native-chat-render-data'
import { useMobileNativeChatFoldReuse } from './mobile-native-chat-fold-reuse'
import type { MobileNativeChatImageAttachments } from './use-mobile-native-chat-image-attachments'
import type { MobileNativeChatController } from './use-mobile-native-chat-controller'
import type { MobileNativeChatStructuredComposer } from './MobileNativeChatComposer'
import { useMobileNativeChatStreamingBubble } from './use-mobile-native-chat-streaming-bubble'
import { useMobileNativeChatThoughtSeconds } from './use-mobile-native-chat-thought-seconds'
import { mobileNativeChatThoughtRows } from './mobile-native-chat-thought-rows'
import { queuedImagesWithPreviews } from './mobile-terminal-message-queue-previews'
import { useMobileNativeChatComposerTray } from './use-mobile-native-chat-composer-tray'
import { useMobileNativeChatVisualRenderer } from './MobileNativeChatVisual'
import { MobileNativeChatVisualContext } from './mobile-native-chat-visual-context'
import { MobileNativeChatItemSourceContext } from './mobile-native-chat-item-read'
import { useMobileNativeChatMessageDetail } from './use-mobile-native-chat-message-detail'
import {
  MobileNativeChatReplyRevealsContext,
  useMobileNativeChatReplyReveals
} from './mobile-native-chat-reply-reveals'
import { MobileNativeChatRowOverlaysHost } from './MobileNativeChatRowOverlaysHost'
import { nativeChatAskRequiresTerminal } from '../../../src/shared/native-chat-agent-support'

type Props = {
  controller: MobileNativeChatController
  /** Project chips and cards read the host's repos and workspaces through these. */
  client: RpcClient | null
  hostId: string
  connState: ConnectionState
  activeSessionTabId?: string | null
  /** Opens a tapped file reference (worktree-relative or absolute, optional
   *  :line(:col) suffix) through the shared tap-to-open flow. */
  onOpenFile: (pathText: string) => void
  /** Native-chat image attachments: picking adds a composer chip, and sending
   *  rides the pending images along with the message text (desktop parity). */
  images: MobileNativeChatImageAttachments
  /** A structured chat's + sheet, files and skills; null on a terminal-backed chat. */
  structuredComposer?: MobileNativeChatStructuredComposer | null
  onMicPress: (() => void) | undefined
  micActive: boolean
  dictationMode: string | undefined
  onMicPressIn: () => void
  onMicPressOut: () => void
  inputLockReason: MobileNativeChatInputLockReason | null
  /** Latest send failure, rendered inline above the composer. */
  sendErrorMessage: string | null
  /** Drops that failure once a later send succeeds. */
  onClearSendError: () => void
  /** Stable host/worktree/tab identity for accepted-send completion fencing. */
  sendSurfaceId: string
  /** The agent session the tab holds; null until the tab's first one is known. */
  sessionId: string | null
  /** Reads the retained route's focus generation for accepted-send fencing. */
  getSendCompletionGeneration: () => number
  keyboardInset: number
}

/** Keeps the terminal mounted underneath chat so its PTY subscription survives
 *  view toggles while the native surface owns the visible composer. Also owns
 *  the streaming gate: this component stays mounted across those toggles, while
 *  the chat list below it does not. */
export function MobileNativeChatOverlay({
  controller,
  client,
  hostId,
  connState,
  activeSessionTabId,
  onOpenFile,
  images,
  structuredComposer = null,
  onMicPress,
  micActive,
  dictationMode,
  onMicPressIn,
  onMicPressOut,
  inputLockReason,
  sendErrorMessage,
  onClearSendError,
  sendSurfaceId,
  sessionId,
  getSendCompletionGeneration,
  keyboardInset
}: Props): React.JSX.Element | null {
  const session = controller.nativeChatSession
  // The chat is drawn only with a resolved agent; the fallback never reaches the screen.
  const agent = controller.nativeChatAgent ?? ''
  const fullContent = useMobileNativeChatMessageDetail(
    session.messages,
    controller.nativeChatItemSource
  )
  const folded = useMobileNativeChatFoldReuse(
    useMemo(
      () => foldMobileNativeChatMessages(fullContent.messages, agent),
      [fullContent.messages, agent]
    ),
    sendSurfaceId
  )
  const streaming = useMobileNativeChatStreamingBubble(
    folded,
    controller.nativeChatStreamingText,
    controller.nativeChatStreamScopeKey,
    controller.nativeChatStreamLive
  )
  // Durations the host's journal did not stamp, read from the transcript (terminal chats).
  const thoughtSeconds = useMobileNativeChatThoughtSeconds(
    controller.nativeChatAgent,
    controller.nativeChatTurnJournal?.items,
    session.messages
  )
  // Live only while nothing streams after it, as the turn's newest output.
  const thoughtWorking = controller.nativeChatAgentWorking && streaming === null
  const timedFolded = useMemo(
    () => mobileNativeChatThoughtRows(folded, thoughtSeconds, thoughtWorking),
    [folded, thoughtSeconds, thoughtWorking]
  )
  const queue = controller.nativeChatQueue
  const queueStack = useMemo(
    () =>
      queue && {
        ...queue,
        // The overlay owns the composer chips, so it puts a restored item's images back.
        onRestore: (item: { id: string; text: string; imagePaths?: string[] }, orphan: boolean) => {
          queue.onRestore(item, orphan)
          images.restoreImages(queuedImagesWithPreviews(item.imagePaths))
        }
      },
    [images, queue]
  )
  const queued = controller.nativeChatQueued
  const composerTray = useMobileNativeChatComposerTray({
    queued: {
      cards: queued.cards,
      onSend: queued.send,
      onDelete: queued.delete,
      onClearAll: queued.clear,
      onEdit: queued.edit,
      editor: queued.editor,
      pause: queued.pause,
      onResume: queued.resume,
      sessionKey: queued.sessionKey,
      // Nothing steers into a turn a Stop is ending; the host holds such a send until it ends.
      // The indicator's `stopping` is the display status, decided once in the session hook.
      steerHeld: controller.nativeChatTurnIndicator?.stopping === true
    },
    backgroundTasks: controller.nativeChatBackgroundTasks
  })
  const visuals = useMobileNativeChatVisualRenderer(controller.nativeChatVisualSource)
  const replyReveals = useMobileNativeChatReplyReveals(folded, streaming !== null, sendSurfaceId)
  const itemSource = controller.nativeChatItemSource
  const detailSource = useMemo(
    () => (itemSource ? { ...itemSource, messageDetail: fullContent.detail } : null),
    [itemSource, fullContent.detail]
  )
  if (!controller.showNativeChat) {
    return null
  }
  return (
    <MobileNativeChatRowOverlaysHost conversation={{ surfaceId: sendSurfaceId, sessionId }}>
      <View style={styles.overlay}>
        <MobileNativeChatProjectsProvider
          client={client}
          hostId={hostId}
          connState={connState}
          messages={session.messages}
          send={controller.handleNativeChatSend}
          canSend={inputLockReason === null}
        >
          <MobileNativeChatVisualContext.Provider value={visuals}>
            <MobileNativeChatItemSourceContext.Provider value={detailSource}>
              <MobileNativeChatReplyRevealsContext.Provider value={replyReveals}>
                <MobileNativeChatView
                  messages={session.messages}
                  folded={timedFolded}
                  status={session.status}
                  error={session.error}
                  readFailedFinally={session.readFailedFinally === true}
                  agent={controller.nativeChatAgent}
                  agentWorking={controller.nativeChatAgentWorking}
                  canStop={controller.nativeChatCanStop}
                  structuredActivityUi={controller.nativeChatStructured}
                  turnIndicator={controller.nativeChatTurnIndicator}
                  workingStartedAt={controller.nativeChatWorkingStartedAt}
                  settledTurns={controller.nativeChatSettledTurns}
                  turnJournal={controller.nativeChatTurnJournal}
                  receipts={controller.nativeChatReceipts}
                  actionablePromptIds={controller.nativeChatActionablePromptIds}
                  streaming={streaming}
                  onStop={controller.handleNativeChatStop}
                  ask={controller.nativeChatAsk}
                  askKey={controller.nativeChatAskKey}
                  promptKey={controller.nativeChatPromptKey}
                  onDismissAsk={controller.dismissNativeChatAsk}
                  onAnswerAsk={controller.handleNativeChatAnswerAsk}
                  askRequiresTerminal={
                    !controller.nativeChatStructured && nativeChatAskRequiresTerminal(agent)
                  }
                  onAnswerInTerminal={
                    activeSessionTabId
                      ? () => controller.setTabView(activeSessionTabId, 'terminal')
                      : undefined
                  }
                  onCancelAsk={controller.handleNativeChatCancelAsk}
                  onCancelPrompt={controller.handleNativeChatCancelPrompt}
                  onCollapseAsk={controller.collapseNativeChatAsk}
                  onCollapsePrompt={controller.collapseNativeChatPrompt}
                  collapsedPrompt={controller.nativeChatCollapsedPrompt}
                  question={controller.nativeChatQuestion}
                  onAnswerQuestion={controller.handleNativeChatQuestionAnswer}
                  permission={controller.nativeChatPermission}
                  onRespondPermission={controller.handleNativeChatRespondPermission}
                  composerTray={composerTray}
                  onOpenFile={onOpenFile}
                  hasMore={session.hasMore}
                  olderPages={session.olderPages}
                  onLoadEarlier={session.loadEarlier}
                  onSend={images.sendNativeChat}
                  sendSurfaceId={sendSurfaceId}
                  getSendCompletionGeneration={getSendCompletionGeneration}
                  getComposerEditGeneration={controller.getChatComposerEditGeneration}
                  pending={controller.chatPending}
                  imagePreviewsByMessageId={controller.chatImagePreviewsByMessageId}
                  composerText={controller.chatComposerText}
                  onComposerTextChange={controller.setChatComposerText}
                  onAttachImage={
                    controller.nativeChatAcceptsImages
                      ? () => void images.attachImage('library')
                      : undefined
                  }
                  attachments={images.attachments}
                  onRemoveAttachment={images.removeAttachment}
                  isAttaching={images.isAttaching}
                  onMicPress={onMicPress}
                  micActive={micActive}
                  dictationMode={dictationMode}
                  onMicPressIn={onMicPressIn}
                  onMicPressOut={onMicPressOut}
                  inputLockReason={inputLockReason}
                  sendErrorMessage={sendErrorMessage}
                  onClearSendError={onClearSendError}
                  filePaths={controller.nativeChatFilePaths}
                  onNeedFiles={controller.loadNativeChatFiles}
                  sessionOptions={controller.nativeChatSessionOptions}
                  structuredComposer={structuredComposer}
                  queue={{ stack: queueStack, willQueue: controller.nativeChatWillQueue }}
                  keyboardInset={keyboardInset}
                />
              </MobileNativeChatReplyRevealsContext.Provider>
            </MobileNativeChatItemSourceContext.Provider>
          </MobileNativeChatVisualContext.Provider>
        </MobileNativeChatProjectsProvider>
      </View>
    </MobileNativeChatRowOverlaysHost>
  )
}

const styles = StyleSheet.create({
  overlay: StyleSheet.absoluteFillObject
})
