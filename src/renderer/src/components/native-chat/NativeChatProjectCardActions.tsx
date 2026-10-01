import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, CornerDownLeft, Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type { NativeChatProjectCardAction } from './native-chat-project-card-payload'
import {
  deriveNativeChatProjectCardChoice,
  readNativeChatProjectCardReply,
  recordNativeChatProjectCardReply,
  type NativeChatProjectCardChoice
} from './native-chat-project-card-choice'
import type { NativeChatProjectReplyChannel } from './native-chat-project-reply-context'

/**
 * A card's actions, styled as the question card's option rows. Each row shows the
 * exact text it sends; nothing sends on its own. One click sends that text as the
 * user's next message and disables every row, and the transcript keeps them
 * disabled across reloads.
 */
export function NativeChatProjectCardActions({
  actions,
  cardKey,
  messageId,
  channel
}: {
  actions: readonly NativeChatProjectCardAction[]
  cardKey: string | null
  messageId: string | undefined
  channel: NativeChatProjectReplyChannel | null
}): React.JSX.Element | null {
  const [sent, setSent] = useState<NativeChatProjectCardChoice | null>(null)
  const [typing, setTyping] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  // Opening the reply box is a request to type; put the caret there.
  useEffect(() => {
    if (typing) {
      inputRef.current?.focus()
    }
  }, [typing])
  const recordedInput = useMemo(
    () => (cardKey ? readNativeChatProjectCardReply(cardKey) : null),
    [cardKey]
  )
  const derived = useMemo(
    () =>
      deriveNativeChatProjectCardChoice({
        actions,
        messages: channel?.messages ?? [],
        messageId,
        recordedInput
      }),
    [actions, channel?.messages, messageId, recordedInput]
  )
  if (actions.length === 0) {
    return null
  }
  const choice = sent ?? derived
  const locked = choice !== null || !channel?.canSend

  const send = (actionIndex: number, text: string, record: boolean): void => {
    if (locked || !channel || text.trim() === '' || !channel.send(text)) {
      return
    }
    if (record && cardKey) {
      recordNativeChatProjectCardReply(cardKey, text)
    }
    setTyping(false)
    setSent({ actionIndex, text })
  }

  return (
    <div
      role="group"
      aria-label={translate('components.native-chat.project.actions', 'Replies')}
      className="divide-y divide-border/60 border-t border-border/60"
    >
      {actions.map((action, index) => {
        const chosen = choice?.actionIndex === index
        if (action.kind === 'input' && typing && !locked) {
          return (
            <form
              key={action.id}
              className="flex items-center gap-3 px-3.5 py-2"
              onSubmit={(event) => {
                event.preventDefault()
                send(index, draft.trim(), true)
              }}
            >
              <span
                aria-hidden
                className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
              >
                <Pencil className="size-3.5" />
              </span>
              <input
                ref={inputRef}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    setTyping(false)
                  }
                }}
                aria-label={action.label}
                placeholder={translate(
                  'components.native-chat.question.otherPlaceholder',
                  'Type your answer'
                )}
                className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/60"
              />
              <button
                type="submit"
                disabled={draft.trim() === ''}
                className="flex shrink-0 items-center gap-1 rounded-md bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-50"
              >
                <CornerDownLeft className="size-3" />
                {translate('components.native-chat.project.send', 'Send')}
              </button>
            </form>
          )
        }
        const sendsText = action.kind === 'reply' ? action.reply : chosen ? choice.text : null
        return (
          <button
            key={action.id}
            type="button"
            disabled={locked}
            data-project-action-chosen={chosen ? 'true' : undefined}
            onClick={() =>
              action.kind === 'reply' ? send(index, action.reply, false) : setTyping(true)
            }
            className={cn(
              'flex w-full items-start gap-3 px-3.5 py-2.5 text-left transition-colors disabled:pointer-events-none',
              chosen ? 'bg-accent' : 'hover:bg-accent',
              locked && !chosen && 'opacity-50'
            )}
          >
            <span
              aria-hidden
              className={cn(
                'flex size-6 shrink-0 items-center justify-center rounded-md text-xs font-medium',
                chosen ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
              )}
            >
              {chosen ? (
                <Check className="size-3.5" strokeWidth={3} />
              ) : action.kind === 'input' ? (
                <Pencil className="size-3.5" />
              ) : (
                index + 1
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span
                className={cn(
                  'block break-words text-sm text-foreground',
                  action.style === 'primary' && 'font-semibold'
                )}
              >
                {action.label}
              </span>
              {sendsText !== null ? (
                <span className="line-clamp-3 block break-words text-xs text-muted-foreground">
                  {chosen
                    ? translate('components.native-chat.project.sentText', 'Sent “{{value0}}”', {
                        value0: sendsText
                      })
                    : translate('components.native-chat.project.sends', 'Sends “{{value0}}”', {
                        value0: sendsText
                      })}
                </span>
              ) : (
                <span className="block text-xs text-muted-foreground">
                  {translate('components.native-chat.project.typeReply', 'Type a reply to send')}
                </span>
              )}
            </span>
          </button>
        )
      })}
    </div>
  )
}
