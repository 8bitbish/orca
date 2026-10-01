// Messages sent while a structured chat's turn runs wait in this client's outbox, one going out per
// turn end and in order, and show in the Queued stack, where Edit and Remove change them.

// @vitest-environment happy-dom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentJournalSubmission } from '../../../../shared/agent-session-journal-types'

type SendRequest = { body?: { blocks?: { type: string; text?: string; path?: string }[] } }

const mocks = vi.hoisted(() => ({
  call: vi.fn<(target: unknown, method: string, params: SendRequest) => Promise<unknown>>()
}))

vi.mock('@/runtime/structured-agent-session-client', () => ({
  callStructuredAgentSession: mocks.call
}))

import { useStructuredAgentSessionOutbox } from './use-structured-agent-session-outbox'
import { useStructuredAgentSessionHeldQueue } from './use-structured-agent-session-held-queue'
import { useStructuredAgentSessionMessages } from './use-structured-agent-session-messages'
import { isStructuredAgentSessionTurnInProgress } from '../../../../shared/structured-agent-session-held-send'

const TARGET = { kind: 'local' } as const
const NO_SUBMISSIONS: AgentJournalSubmission[] = []

function sentTexts(): (string | undefined)[] {
  return mocks.call.mock.calls.map(
    (call) => call[2].body?.blocks?.find((block) => block.type === 'text')?.text
  )
}

function pending(clientMessageId: string): AgentJournalSubmission {
  return {
    clientMessageId,
    fence: 1,
    payloadFingerprint: 'fingerprint',
    dispatchState: 'pending',
    providerItemId: null,
    reason: null,
    submittedAt: 10,
    resolvedAt: null,
    handoverRecorded: true,
    handedOverAt: 11
  }
}

/** The outbox and the stack as the controller wires them, with the turn under the test's hand. */
function renderQueue(initial: { working: boolean }) {
  return renderHook(
    ({ working }: { working: boolean }) => {
      const [editingId, setEditingId] = useState<string | null>(null)
      const outbox = useStructuredAgentSessionOutbox({
        sessionId: 'session-1',
        target: TARGET,
        fence: 1,
        submissions: NO_SUBMISSIONS,
        hold: { turn: working, editingId }
      })
      const queue = useStructuredAgentSessionHeldQueue({
        outbox: outbox.outbox,
        blockedClientMessageId: outbox.blockedClientMessageId,
        working,
        turnId: working ? 'turn-1' : null,
        awaitingAnswer: false,
        editingId,
        setEditingId,
        revise: outbox.revise
      })
      const messages = useStructuredAgentSessionMessages(
        [],
        outbox.outbox,
        NO_SUBMISSIONS,
        queue.heldIds
      )
      return { outbox, queue, messages }
    },
    { initialProps: initial }
  )
}

function rows(result: { current: ReturnType<typeof renderQueue>['result']['current'] }) {
  return result.current.queue.stackProps.snapshot.items.map((item) => item.text)
}

afterEach(cleanup)

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  // Never answered: each send stays on its way, so what was sent is all the test reads.
  mocks.call.mockImplementation(() => new Promise<never>(() => {}))
  let uuid = 0
  vi.spyOn(globalThis.crypto, 'randomUUID').mockImplementation(() => {
    uuid += 1
    return `11111111-1111-4111-8111-${uuid.toString(16).padStart(12, '0')}`
  })
})

async function settle(): Promise<void> {
  await act(async () => new Promise((resolve) => setTimeout(resolve, 30)))
}

describe('a structured chat whose turn is running', () => {
  it('keeps a message sent now in the stack, out of the transcript, and sends nothing', async () => {
    const { result } = renderQueue({ working: true })
    act(() => expect(result.current.outbox.send('After this.')).toBe(true))
    await settle()

    expect(mocks.call).not.toHaveBeenCalled()
    expect(rows(result)).toEqual(['After this.'])
    expect(result.current.messages).toEqual([])
    expect(result.current.queue.composerQueue.willQueue).toBe(true)
  })

  it('sends the queue in order, one per turn end', async () => {
    const { result, rerender } = renderQueue({ working: true })
    act(() => {
      result.current.outbox.send('first')
      result.current.outbox.send('second')
    })
    await settle()
    expect(rows(result)).toEqual(['first', 'second'])

    rerender({ working: false })
    await waitFor(() => expect(sentTexts()).toEqual(['first']))
    // The first's own turn starts as it goes; the second waits for that one to end.
    rerender({ working: true })
    await settle()
    expect(sentTexts()).toEqual(['first'])
    expect(rows(result)).toEqual(['second'])
  })

  it('removes a queued message so it never goes out', async () => {
    const { result, rerender } = renderQueue({ working: true })
    act(() => {
      result.current.outbox.send('drop me')
      result.current.outbox.send('keep me')
    })
    const dropped = result.current.queue.stackProps.snapshot.items[0]!.id
    act(() => result.current.queue.stackProps.onRemove(dropped))
    expect(rows(result)).toEqual(['keep me'])

    rerender({ working: false })
    await waitFor(() => expect(sentTexts()).toEqual(['keep me']))
  })

  it('sends the edited text, and holds the message while it is being edited', async () => {
    const { result, rerender } = renderQueue({ working: true })
    act(() => {
      result.current.outbox.send('draft one')
    })
    const id = result.current.queue.stackProps.snapshot.items[0]!.id
    act(() => result.current.queue.stackProps.onSetEditing(id, true))

    // The turn ends mid-edit: nothing goes out while the person is still changing it.
    rerender({ working: false })
    await settle()
    expect(mocks.call).not.toHaveBeenCalled()
    expect(rows(result)).toEqual(['draft one'])

    await act(async () => {
      expect(await result.current.queue.stackProps.onSaveEdit(id, 'final wording')).toBe(true)
    })
    await waitFor(() => expect(sentTexts()).toEqual(['final wording']))
  })

  it('keeps the images of a message whose text was edited', async () => {
    const { result, rerender } = renderQueue({ working: true })
    act(() => {
      result.current.outbox.send('look', [{ path: '/tmp/shot.png', previewUri: '/tmp/shot.png' }])
    })
    const id = result.current.queue.stackProps.snapshot.items[0]!.id
    expect(result.current.queue.stackProps.snapshot.items[0]!.imagePaths).toEqual(['/tmp/shot.png'])
    await act(async () => {
      await result.current.queue.stackProps.onSaveEdit(id, 'look at this')
    })
    rerender({ working: false })
    await waitFor(() => expect(mocks.call).toHaveBeenCalledOnce())
    expect(mocks.call.mock.calls[0]![2].body?.blocks).toEqual([
      { type: 'text', text: 'look at this' },
      { type: 'image-ref', path: '/tmp/shot.png' }
    ])
  })

  it('says the agent is stopping once Stop is pressed, until the turn settles', () => {
    const { result, rerender } = renderQueue({ working: true })
    act(() => {
      result.current.outbox.send('next')
    })
    expect(result.current.queue.stackProps.snapshot.interrupting).toBe(false)
    act(() => result.current.queue.noteStop())
    expect(result.current.queue.stackProps.snapshot.interrupting).toBe(true)
    rerender({ working: false })
    expect(result.current.queue.stackProps.snapshot.interrupting).toBe(false)
  })
})

describe('a structured chat at rest', () => {
  it('sends straight away and shows nothing queued', async () => {
    const { result } = renderQueue({ working: false })
    act(() => {
      result.current.outbox.send('now')
    })
    await waitFor(() => expect(sentTexts()).toEqual(['now']))
    expect(rows(result)).toEqual([])
    expect(result.current.queue.composerQueue.willQueue).toBe(false)
  })
})

describe('whether a turn is in progress', () => {
  it('counts a running turn and a send the provider holds, never a send the host still holds', () => {
    const queuedOnHost = { ...pending('held'), handedOverAt: undefined }
    expect(isStructuredAgentSessionTurnInProgress('turn-1', [], 1)).toBe(true)
    expect(isStructuredAgentSessionTurnInProgress(null, [pending('handed')], 1)).toBe(true)
    expect(isStructuredAgentSessionTurnInProgress(null, [queuedOnHost], 1)).toBe(false)
    // A send an earlier owner was handed is that owner's, settled when it ended.
    expect(isStructuredAgentSessionTurnInProgress(null, [pending('handed')], 2)).toBe(false)
  })
})
