import { useEffect, useRef, useState } from 'react'
import { ImageIcon, Loader2, Pencil, RotateCcw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'

/** One row of the stack: a live queued item, or one the host can no longer send. */
export type NativeChatQueuedRowItem = {
  id: string
  text: string
  imagePaths?: string[]
  status: 'queued' | 'delivering' | 'editing-elsewhere' | 'not-sent'
  notSentReason?: 'exited' | 'failed' | 'lost'
}

type RowProps = {
  item: NativeChatQueuedRowItem
  position: number
  editing: boolean
  onBeginEdit: () => void
  onCancelEdit: () => void
  onSaveEdit: (text: string) => void
  onRemove: () => void
  onRestore: () => void
}

function notSentLabel(reason: NativeChatQueuedRowItem['notSentReason']): string {
  if (reason === 'exited') {
    return translate('components.native-chat.queue.notSentExited', 'Not sent — the terminal closed')
  }
  if (reason === 'failed') {
    return translate('components.native-chat.queue.notSentFailed', 'Not sent — delivery failed')
  }
  return translate('components.native-chat.queue.notSentLost', 'Not sent — the queue was lost')
}

function IconAction(props: {
  label: string
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={props.label}
          disabled={props.disabled}
          onClick={props.onClick}
          className="pointer-coarse:size-9"
        >
          {props.children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4}>
        {props.label}
      </TooltipContent>
    </Tooltip>
  )
}

function QueuedMessageEditor(props: {
  initialText: string
  onCancel: () => void
  onSave: (text: string) => void
}): React.JSX.Element {
  const [text, setText] = useState(props.initialText)
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const element = ref.current
    element?.focus()
    element?.setSelectionRange(element.value.length, element.value.length)
  }, [])
  const save = (): void => {
    if (text.trim() !== '') {
      props.onSave(text)
    }
  }
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <Textarea
        ref={ref}
        value={text}
        aria-label={translate('components.native-chat.queue.editLabel', 'Edit queued message')}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          // Why: Escape here cancels the edit; it must not reach the composer's Stop.
          if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            props.onCancel()
          } else if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault()
            event.stopPropagation()
            save()
          }
        }}
        className="min-h-14"
      />
      <div className="flex justify-end gap-1.5">
        <Button type="button" variant="ghost" size="xs" onClick={props.onCancel}>
          {translate('components.native-chat.queue.cancelEdit', 'Cancel')}
        </Button>
        <Button type="button" size="xs" disabled={text.trim() === ''} onClick={save}>
          {translate('components.native-chat.queue.saveEdit', 'Save')}
        </Button>
      </div>
    </div>
  )
}

export function NativeChatQueuedMessageRow({
  item,
  position,
  editing,
  onBeginEdit,
  onCancelEdit,
  onSaveEdit,
  onRemove,
  onRestore
}: RowProps): React.JSX.Element {
  const imageCount = item.imagePaths?.length ?? 0
  const notSent = item.status === 'not-sent'
  return (
    <li
      data-native-chat-queued-item={item.status}
      className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-2 py-1.5 text-sm"
    >
      <span
        aria-hidden
        className="w-4 shrink-0 pt-px text-right text-xs text-muted-foreground tabular-nums"
      >
        {position}
      </span>
      {editing ? (
        <QueuedMessageEditor initialText={item.text} onCancel={onCancelEdit} onSave={onSaveEdit} />
      ) : (
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 break-words whitespace-pre-wrap text-foreground">
            <span className="sr-only">
              {translate('components.native-chat.queue.itemPrefix', 'Queued message {{value0}}: ', {
                value0: position
              })}
            </span>
            {item.text}
          </p>
          {imageCount > 0 || item.status !== 'queued' ? (
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
              {imageCount > 0 ? (
                <span className="inline-flex items-center gap-1">
                  <ImageIcon className="size-3" />
                  {translate('components.native-chat.queue.imageCount', '{{value0}} image(s)', {
                    value0: imageCount
                  })}
                </span>
              ) : null}
              {item.status === 'delivering' ? (
                <span className="inline-flex items-center gap-1">
                  <Loader2 className="size-3 animate-spin" />
                  {translate('components.native-chat.queue.sending', 'Sending…')}
                </span>
              ) : null}
              {item.status === 'editing-elsewhere' ? (
                <span>
                  {translate('components.native-chat.queue.editingElsewhere', 'Being edited')}
                </span>
              ) : null}
              {notSent ? <span>{notSentLabel(item.notSentReason)}</span> : null}
            </div>
          ) : null}
        </div>
      )}
      {editing ? null : (
        <div className="flex shrink-0 items-center">
          {notSent ? (
            <IconAction
              label={translate('components.native-chat.queue.restore', 'Restore to composer')}
              onClick={onRestore}
            >
              <RotateCcw className="size-3.5" />
            </IconAction>
          ) : (
            <IconAction
              label={translate('components.native-chat.queue.edit', 'Edit queued message')}
              disabled={item.status !== 'queued'}
              onClick={onBeginEdit}
            >
              <Pencil className="size-3.5" />
            </IconAction>
          )}
          <IconAction
            label={
              notSent
                ? translate('components.native-chat.queue.discard', 'Discard message')
                : translate('components.native-chat.queue.remove', 'Remove from queue')
            }
            disabled={item.status === 'delivering'}
            onClick={onRemove}
          >
            <X className="size-3.5" />
          </IconAction>
        </div>
      )}
    </li>
  )
}
