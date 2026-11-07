import { readNativeChatComposerDraft } from './native-chat-composer-draft-store'
import { serializeNativeChatAgentReferences } from './native-chat-agent-reference-send'
import {
  admitNativeChatPastedText,
  resolveNativeChatPastedText
} from './native-chat-composer-pasted-text-references'
import { useCallback, useContext, type Dispatch, type SetStateAction } from 'react'
import { NativeChatComposerHostQueueContext } from './native-chat-composer-host-queue-context'
import type { AgentType } from '../../../../shared/agent-status/contracts/agent-status-types'
import type { NativeChatLaunchDraft } from '@/components/native-chat/drafts/native-chat-launch-prompt'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '../../store/index'
import { emitNativeChatMessageSent } from '@/components/native-chat/telemetry/native-chat-telemetry'
import {
  sendNativeChatMessage,
  sendNativeChatTypedCommand,
  submitNativeChatPrompt,
  type NativeChatSendHandle
} from './native-chat-runtime-send'
import { sendNativeChatMessageWithImageAttachments } from './native-chat-runtime-image-send'
import { resolveNativeChatLaunchDraftSend } from './native-chat-launch-draft-send'
import {
  nativeChatComposerTargetIsRemote,
  type NativeChatResolvedTarget
} from './native-chat-composer-target'
import { isSlashCommandDraft } from '../../../../shared/native-chat/input/native-chat-slash-commands'
import type { NativeChatPickerState } from './use-native-chat-picker-state'
import type { NativeChatSendLifecycle } from './use-native-chat-send-lifecycle'
import type { NativeChatPtySessionOptionsSurface } from '../../../../shared/native-chat/input/native-chat-pty-session-options'
import type { NativeChatOptimisticSendOutcome } from './native-chat-composer-types'
import {
  answerNativeChatCommandInComposer,
  type NativeChatLocalCommandAnswer
} from './use-native-chat-local-command-answer'

type PtyComposerSendArgs = {
  agent: AgentType
  draft: string
  draftScopeKey: string
  imageAttachments: readonly { path: string }[]
  disabled: boolean
  isDispatchingSessionOption: boolean
  launchDraft?: NativeChatLaunchDraft | null
  launchDraftResolved: boolean
  readTerminalDraft?: () => string | null
  resolveTarget: () => NativeChatResolvedTarget | null
  classifySend: NativeChatPickerState['classifySend']
  onOptimisticSend?: (text: string, imagePaths?: string[], recovery?: boolean) => string | undefined
  optimisticSendOutcome?: NativeChatOptimisticSendOutcome
  onSlashCommand?: (command: string, output?: string) => void
  answerCommandLocally?: NativeChatLocalCommandAnswer
  onSubmitted?: () => void
  sessionOptionsSurface: NativeChatPtySessionOptionsSurface | null
  terminalTabId: string
  trackPendingSend: NativeChatSendLifecycle['trackPendingSend']
  setDraft: (value: string) => void
  setCaret: Dispatch<SetStateAction<number>>
  clearSkillOrigin: () => void
  clearImageAttachments: () => void
  setNotice: (notice: string | null) => void
}

/** A failed chat message sent again as-is; the draft is left alone. */
export type NativeChatPtyRetry = { text: string; imagePaths?: string[] }

export function useNativeChatPtyComposerSend(
  args: PtyComposerSendArgs
): (send?: string | NativeChatPtyRetry) => boolean {
  const queue = useContext(NativeChatComposerHostQueueContext)
  // A string `reply` (a project card's action) is sent as typed text and leaves the draft alone.
  return useCallback(
    (send?: string | NativeChatPtyRetry): boolean => {
      const reply = typeof send === 'string' ? send : undefined
      const retry = typeof send === 'object' ? send : undefined
      const keepDraft = send !== undefined
      let text = reply ?? retry?.text ?? args.draft
      const imagePaths =
        retry?.imagePaths ??
        (keepDraft ? [] : args.imageAttachments.map((attachment) => attachment.path))
      if ((text.trim() === '' && imagePaths.length === 0) || args.disabled) {
        return false
      }
      // Prevent option commands from interleaving with prompt writes on the PTY input line.
      if (args.isDispatchingSessionOption) {
        return false
      }
      const target = args.resolveTarget()
      if (!target) {
        return false
      }
      const classification = retry ? 'chat' : args.classifySend(text)
      // A card reply is never a composer-answered command; only the typed draft can be.
      if (
        reply === undefined &&
        classification === 'command' &&
        answerNativeChatCommandInComposer(args)
      ) {
        return false
      }
      if (reply === undefined) {
        if (!admitNativeChatPastedText(args.draftScopeKey, text, args.setNotice)) {
          return false
        }
        const submitted = readNativeChatComposerDraft(args.draftScopeKey)
        text = retry
          ? resolveNativeChatPastedText(args.draftScopeKey, text)
          : serializeNativeChatAgentReferences(text, submitted.document, submitted.pastedTextFiles)
      }
      if (classification === 'chat' && queue?.willQueue) {
        // Why: typed into a mid-turn TUI, the prompt is absorbed into the running turn. The host
        // holds it instead; if it answers that the agent went idle meanwhile, or cannot hold it,
        // the prompt goes out the way it always did.
        void queue.enqueue(text, imagePaths).then((outcome) => {
          if (outcome !== 'queued') {
            sendNow(args, target, text, imagePaths, classification, retry !== undefined)
          }
        })
        finishSend(args, keepDraft)
        return true
      }
      // An unreadable input line leaves the draft in place to retry.
      if (!sendNow(args, target, text, imagePaths, classification, retry !== undefined)) {
        return false
      }
      finishSend(args, keepDraft)
      return true
    },
    [args, queue]
  )
}

function sendNow(
  args: PtyComposerSendArgs,
  target: NativeChatResolvedTarget,
  text: string,
  imagePaths: string[],
  classification: ReturnType<NativeChatPickerState['classifySend']>,
  retry: boolean
): boolean {
  const { sendOptions: launchSendOptions } = resolveNativeChatLaunchDraftSend({
    launchDraft: args.launchDraft,
    launchDraftResolved: args.launchDraftResolved,
    agent: args.agent,
    readInputLine: () => args.readTerminalDraft?.()
  })
  if (launchSendOptions.clearInput === null) {
    args.setNotice(translate('components.native-chat.messageNotSent', 'Message not sent'))
    return false
  }
  let pendingId: string | undefined
  const sendOptions =
    args.agent === 'claude' && classification === 'chat'
      ? {
          ...launchSendOptions,
          onWriteRejected: () => {
            if (pendingId) {
              args.optimisticSendOutcome?.reject(pendingId)
            }
          },
          onWriteUnconfirmed: () => {
            if (pendingId) {
              args.optimisticSendOutcome?.holdUnconfirmed(pendingId)
            }
          }
        }
      : launchSendOptions
  let pendingHandle: NativeChatSendHandle | null = null
  // Why: slash-like text must not silently drop its attached images.
  if (classification !== 'chat' && imagePaths.length === 0) {
    pendingHandle =
      args.agent === 'codex' && isSlashCommandDraft(text)
        ? sendNativeChatTypedCommand(target.ptyId, text, launchSendOptions)
        : sendNativeChatMessage(target.ptyId, text, sendOptions)
  } else if (imagePaths.length > 0) {
    pendingHandle = sendNativeChatMessageWithImageAttachments(
      args.agent,
      target.ptyId,
      text,
      imagePaths,
      sendOptions
    )
  } else if (text.trim().length > 0) {
    pendingHandle = sendNativeChatMessage(target.ptyId, text, sendOptions)
  } else {
    submitNativeChatPrompt(target.ptyId)
  }
  if (classification !== 'chat') {
    if (pendingHandle) {
      args.trackPendingSend(pendingHandle)
    }
    if (classification === 'command') {
      args.onSlashCommand?.(text.trim())
      args.sessionOptionsSurface?.recordOutgoingCommand(text.trim())
    }
  } else {
    pendingId = args.onOptimisticSend?.(text, imagePaths, retry)
    if (pendingHandle) {
      args.trackPendingSend(pendingHandle, pendingId)
      if (retry && pendingId) {
        const id = pendingId
        void pendingHandle.outcome?.then((outcome) => {
          if (outcome === 'not-submitted') {
            args.optimisticSendOutcome?.reject(id)
          } else if (outcome === 'uncertain') {
            args.optimisticSendOutcome?.holdUnconfirmed(id)
          }
        })
      }
    }
  }
  emitNativeChatMessageSent({
    agent: args.agent,
    runtime: nativeChatComposerTargetIsRemote(target.ptyId) ? 'remote' : 'local'
  })
  // The launch draft's TUI line was consumed by this write either way.
  useAppStore.getState().clearNativeChatLaunchDraft(args.terminalTabId)
  return true
}

function finishSend(args: PtyComposerSendArgs, keepDraft: boolean): void {
  args.onSubmitted?.()
  if (keepDraft) {
    return
  }
  args.setDraft('')
  args.setCaret(0)
  args.clearSkillOrigin()
  args.clearImageAttachments()
  args.setNotice(null)
}
