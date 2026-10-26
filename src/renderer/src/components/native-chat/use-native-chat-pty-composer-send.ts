import {
  admitNativeChatPastedText,
  resolveNativeChatPastedText
} from './native-chat-composer-pasted-text-references'
import { useCallback, type Dispatch, type SetStateAction } from 'react'
import type { AgentType } from '../../../../shared/agent-status-types'
import type { NativeChatLaunchDraft } from '@/lib/native-chat-launch-prompt'
import { useAppStore } from '../../store'
import { emitNativeChatMessageSent } from '@/lib/native-chat-telemetry'
import {
  sendNativeChatMessage,
  sendNativeChatTypedCommand,
  submitNativeChatPrompt
} from './native-chat-runtime-send'
import type { NativeChatSendHandle } from './native-chat-runtime-send'
import { sendNativeChatMessageWithImageAttachments } from './native-chat-runtime-image-send'
import { resolveNativeChatLaunchDraftSend } from './native-chat-launch-draft-send'
import { nativeChatComposerTargetIsRemote } from './native-chat-composer-target'
import type { NativeChatResolvedTarget } from './native-chat-composer-target'
import { isSlashCommandDraft } from '../../../../shared/native-chat-slash-commands'
import type { NativeChatPickerState } from './use-native-chat-picker-state'
import type { NativeChatSendLifecycle } from './use-native-chat-send-lifecycle'
import type { NativeChatPtySessionOptionsSurface } from './native-chat-pty-session-options'
import type {
  NativeChatComposerQueue,
  NativeChatOptimisticSendOutcome
} from './native-chat-composer-types'
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
  readTerminalScreen?: () => string | null
  resolveTarget: () => NativeChatResolvedTarget | null
  classifySend: NativeChatPickerState['classifySend']
  onOptimisticSend?: (text: string, imagePaths?: string[]) => string | undefined
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
  /** Present when the host holds mid-turn prompts; absent keeps every send direct, as before. */
  queue?: NativeChatComposerQueue | null
}

export function useNativeChatPtyComposerSend(
  args: PtyComposerSendArgs
): (reply?: string) => boolean {
  // A `reply` (a project card's action) is sent as typed text and leaves the draft alone.
  return useCallback(
    (reply?: string): boolean => {
      let text = reply ?? args.draft
      const imagePaths =
        reply === undefined ? args.imageAttachments.map((attachment) => attachment.path) : []
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
      const classification = args.classifySend(text)
      // A card reply is never a composer-answered command; only the typed draft can be.
      if (
        reply === undefined &&
        classification === 'command' &&
        answerNativeChatCommandInComposer(args)
      ) {
        return true
      }
      if (reply === undefined) {
        if (!admitNativeChatPastedText(args.draftScopeKey, text, args.setNotice)) {
          return false
        }
        text = resolveNativeChatPastedText(args.draftScopeKey, text)
      }
      const queue = args.queue
      if (classification === 'chat' && queue?.willQueue) {
        // Why: typed into a mid-turn TUI, the prompt is absorbed into the running turn. The host
        // holds it instead; if it answers that the agent went idle meanwhile, or cannot hold it,
        // the prompt goes out the way it always did.
        void queue.enqueue(text, imagePaths).then((outcome) => {
          if (outcome !== 'queued') {
            sendNow(args, target, text, imagePaths, classification)
          }
        })
        finishSend(args, reply)
        return true
      }
      sendNow(args, target, text, imagePaths, classification)
      finishSend(args, reply)
      return true
    },
    [args]
  )
}

function sendNow(
  args: PtyComposerSendArgs,
  target: NativeChatResolvedTarget,
  text: string,
  imagePaths: string[],
  classification: ReturnType<NativeChatPickerState['classifySend']>
): void {
  const { sendOptions: launchSendOptions } = resolveNativeChatLaunchDraftSend({
    launchDraft: args.launchDraft,
    launchDraftResolved: args.launchDraftResolved,
    agent: args.agent,
    readScreen: () => args.readTerminalScreen?.()
  })
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
  // Slash-like drafts with images must retain their attachments.
  if (classification !== 'chat' && imagePaths.length === 0) {
    pendingHandle =
      args.agent === 'codex' && isSlashCommandDraft(text)
        ? sendNativeChatTypedCommand(target.ptyId, text)
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
    pendingId = args.onOptimisticSend?.(text, imagePaths)
    if (pendingHandle) {
      args.trackPendingSend(pendingHandle, pendingId)
    }
  }
  emitNativeChatMessageSent({
    agent: args.agent,
    runtime: nativeChatComposerTargetIsRemote(target.ptyId) ? 'remote' : 'local'
  })
  // The launch draft's TUI line was consumed by this write either way.
  useAppStore.getState().clearNativeChatLaunchDraft(args.terminalTabId)
}

function finishSend(args: PtyComposerSendArgs, reply: string | undefined): void {
  args.onSubmitted?.()
  if (reply !== undefined) {
    return
  }
  args.setDraft('')
  args.setCaret(0)
  args.clearSkillOrigin()
  args.clearImageAttachments()
  args.setNotice(null)
}
