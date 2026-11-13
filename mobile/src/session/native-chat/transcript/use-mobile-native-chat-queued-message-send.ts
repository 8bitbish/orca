import { useCallback } from 'react'
import {
  useMobileNativeChatMessageSend,
  type MobileNativeChatMessageSend
} from './use-mobile-native-chat-message-send'
import { openMobileNativeChatSendBudget } from '../composer/mobile-native-chat-send'
import { healMobileNativeChatStaleInput } from '../composer/mobile-native-chat-stale-input'
import { classifyMobileNativeChatSend } from '../composer/mobile-native-chat-send-classification'
import { readMobileNativeChatSkillOrigin } from '../composer/mobile-native-chat-draft-store'
import { useMobileNativeChatTerminalSendOrigin } from '../use-mobile-native-chat-terminal-send-origin'
import {
  mobileNativeChatQueueOffer,
  type MobileNativeChatQueueSubmit
} from '../../mobile-native-chat-queue-send'

type Args = Parameters<typeof useMobileNativeChatMessageSend>[0] & {
  /** The terminal turn's working epoch, stamped on each send's origin. */
  workingEpoch: number | null | undefined
  /** The host's queue for this terminal; null on a host without one, or before it is live. */
  queueSubmit?: MobileNativeChatQueueSubmit | null
}

/** The composer send on a host that holds mid-turn prompts: a chat send is offered to the host
 *  queue first, and only a 'direct' answer reaches the terminal. */
export function useMobileNativeChatQueuedMessageSend(args: Args): MobileNativeChatMessageSend {
  const { queueSubmit = null, workingEpoch, ...rest } = args
  const captureSendOrigin = useMobileNativeChatTerminalSendOrigin(
    rest.captureSendOrigin,
    workingEpoch
  )
  const sendArgs = { ...rest, captureSendOrigin }
  const direct = useMobileNativeChatMessageSend(sendArgs)
  const { client, enabled, handleRef, deviceTokenRef, agentRef } = sendArgs
  const { clearDraftForSend, restoreRejectedDraft, onSendError } = sendArgs
  const { sendWithOutcome: directSend } = direct

  const sendWithOutcome = useCallback<MobileNativeChatMessageSend['sendWithOutcome']>(
    async (draftText, images, deadline, attachments, sentAt, intent) => {
      const text = draftText.trimEnd()
      const terminal = handleRef.current
      // An offline-queued replay's text is not the composer's draft; it goes direct.
      const origin = queueSubmit && !intent?.queued ? captureSendOrigin(text, sentAt) : null
      const skillOrigin = origin ? readMobileNativeChatSkillOrigin(origin.draftKey) : undefined
      const chat = classifyMobileNativeChatSend(agentRef.current, text, skillOrigin) === 'chat'
      // Why: typed into a mid-turn TUI the prompt is absorbed by the running turn; the host holds
      // it instead and its echo appears on delivery. An idle agent answers 'direct'.
      const offer =
        origin && client && terminal && enabled
          ? mobileNativeChatQueueOffer({
              submit: queueSubmit,
              eligible: chat && !images?.length,
              text,
              draftText,
              origin,
              clearDraft: clearDraftForSend,
              restoreDraft: restoreRejectedDraft,
              onSendError
            })
          : null
      const queued = offer ? await offer : null
      if (queued === 'queued' || queued === 'rejected') {
        return queued === 'queued' ? 'accepted' : 'rejected'
      }
      if (queued === null || !origin || !client || !terminal) {
        return directSend(draftText, images, deadline, attachments, sentAt, intent)
      }
      // The offer already cleared the draft, so a failed heal must hand it back here.
      const budget = deadline ?? openMobileNativeChatSendBudget()
      const deviceToken = deviceTokenRef.current
      if (
        !(await healMobileNativeChatStaleInput({ client, terminal, deviceToken, deadline: budget }))
      ) {
        restoreRejectedDraft(origin, draftText)
        onSendError('Message not sent')
        return 'rejected'
      }
      return directSend(draftText, images, budget, attachments, sentAt, intent)
    },
    [
      agentRef,
      captureSendOrigin,
      clearDraftForSend,
      client,
      deviceTokenRef,
      directSend,
      enabled,
      handleRef,
      onSendError,
      queueSubmit,
      restoreRejectedDraft
    ]
  )

  const send = useCallback(
    async (text: string, images?: string[]): Promise<boolean> =>
      (await sendWithOutcome(text, images)) !== 'rejected',
    [sendWithOutcome]
  )

  return { ...direct, send, sendWithOutcome }
}
