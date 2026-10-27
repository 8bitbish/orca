import { useCallback, useLayoutEffect, useMemo } from 'react'
import { StyleSheet, View } from 'react-native'
import type { RpcClient } from '../transport/rpc-client'
import type { ConnectionState } from '../transport/types'
import { MobileNativeChatProjectsProvider } from './project-cards/MobileNativeChatProjectsProvider'
import { MobileNativeChatView, type MobileNativeChatInputLockReason } from './MobileNativeChatView'
import { foldMobileNativeChatMessages } from './mobile-native-chat-render-data'
import type { MobileNativeChatImageAttachments } from './native-chat/composer/use-mobile-native-chat-image-attachments'
import type { MobileNativeChatController } from './use-mobile-native-chat-controller'
import type { MobileNativeChatStructuredComposer } from './native-chat/composer/MobileNativeChatComposer'
import { useMobileNativeChatStreamingBubble } from './native-chat/use-mobile-native-chat-streaming-bubble'
import { useMobileNativeChatThoughtSeconds } from './use-mobile-native-chat-thought-seconds'
import { mobileNativeChatThoughtRows } from './mobile-native-chat-thought-rows'
import { queuedImagesWithPreviews } from './mobile-terminal-message-queue-previews'
import { useMobileNativeChatComposerTray } from './native-chat/composer/use-mobile-native-chat-composer-tray'
import { useMobileNativeChatVisualRenderer } from './MobileNativeChatVisual'
import { MobileNativeChatVisualContext } from './mobile-native-chat-visual-context'
import { MobileNativeChatRootItemSourceContext } from './mobile-native-chat-item-read'
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
  onOpenFile: (pathText: string) => void
  images: MobileNativeChatImageAttachments
  structuredComposer?: MobileNativeChatStructuredComposer | null
  onMicPress: (() => void) | undefined
  micActive: boolean
  dictationMode: string | undefined
  onMicPressIn: () => void
  onMicPressOut: () => void
  inputLockReason: MobileNativeChatInputLockReason | null
  sendErrorMessage: string | null
  onClearSendError: () => void
  /** Stable host/worktree/tab identity for accepted-send completion fencing. */
  sendSurfaceId: string
  sessionId: string | null
  getSendCompletionGeneration: () => number
  keyboardInset: number
}

// Keep the terminal subscription and streaming gate above view toggles; the chat list unmounts below this boundary.
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
  const agent = controller.nativeChatAgent ?? ''
  const fullContent = useMobileNativeChatMessageDetail(
    session.messages,
    controller.nativeChatItemSource
  )
  const folded = useMemo(
    () => foldMobileNativeChatMessages(fullContent.messages, agent),
    [fullContent.messages, agent]
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
      // Hold steering while Stop ends the turn; use the session’s single display-status decision.
      steerHeld: controller.nativeChatTurnIndicator?.stopping === true
    },
    backgroundTasks: controller.nativeChatBackgroundTasks
  })
  const visuals = useMobileNativeChatVisualRenderer(controller.nativeChatVisualSource)
  const replyReveals = useMobileNativeChatReplyReveals(folded, streaming !== null, sendSurfaceId)
  const itemSource = controller.nativeChatItemSource
  const committedDetail = useMemo(
    () => ({ current: fullContent.detail }),
    [itemSource?.client, itemSource?.sessionId]
  )
  useLayoutEffect(() => {
    committedDetail.current = fullContent.detail
  }, [committedDetail, fullContent.detail])
  const load = useCallback(
    async (id: string) => {
      if (!committedDetail.current) {
        throw new Error('Message unavailable')
      }
      await committedDetail.current.load(id)
    },
    [committedDetail]
  )
  const detailSource = useMemo(
    () =>
      itemSource
        ? {
            ...itemSource,
            messageDetail: fullContent.detail ? { ...fullContent.detail, load } : null
          }
        : null,
    [itemSource, fullContent.detail, load]
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
            <MobileNativeChatRootItemSourceContext.Provider value={detailSource}>
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
            </MobileNativeChatRootItemSourceContext.Provider>
          </MobileNativeChatVisualContext.Provider>
        </MobileNativeChatProjectsProvider>
      </View>
    </MobileNativeChatRowOverlaysHost>
  )
}

const styles = StyleSheet.create({
  overlay: StyleSheet.absoluteFillObject
})
