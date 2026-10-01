import { useRef, useState } from 'react'
import * as structuredConversationCommands from './structured-conversation-command-send'
import type { AgentSessionPromptResult } from '../../../../shared/agent-session-wire'
import { useStructuredAgentSessionOutbox } from './use-structured-agent-session-outbox'
import type {
  AgentSessionConversationCommand,
  AgentSessionConversationCommandResult
} from '../../../../shared/agent-session-conversation-command'
import type { AgentType } from '../../../../shared/agent-status-types'
import type { RuntimeClientTarget } from '@/runtime/runtime-rpc-client'
import {
  supportsStructuredAgentSessionPromptCancel,
  supportsStructuredAgentSessionQuestionAnswers
} from '@/runtime/structured-agent-session-client'
import { useStructuredAgentSessionHostStopsConversation } from '@/runtime/structured-agent-session-host-capability'
import { hasUnsentStructuredAgentSessionOutboxEntry } from '../../../../shared/structured-agent-session-outbox-stop-withdrawal'
import {
  legacyAgentSessionSelectedOptionId,
  type AgentSessionPromptResponse
} from '../../../../shared/agent-session-question-answer'
import {
  pendingStructuredSessionPrompts,
  type StructuredPromptItem
} from './structured-agent-session-message-projection'
import { useStructuredAgentSessionMessages } from './use-structured-agent-session-messages'
import { useStructuredAgentSessionTransportState } from './use-structured-agent-session-transport-state'
import { useStructuredAgentSessionTransport } from './use-structured-agent-session-transport'
import { useStructuredAgentSessionOptions } from './use-structured-agent-session-options'
import type { StructuredAgentSessionLaunchView } from './use-native-chat-provisional-launch'
import { useStructuredAgentSessionThreadGoal } from './use-structured-agent-session-thread-goal'
import { useStructuredAgentSessionContextUsage } from './use-structured-agent-session-context-usage'
import { useStructuredAgentSessionRailOutline } from './use-structured-agent-session-rail-outline'
import { useStructuredAgentSessionHeldQueue } from './use-structured-agent-session-held-queue'
import { isStructuredAgentSessionTurnInProgress } from '../../../../shared/structured-agent-session-held-send'

export type { StructuredPromptItem } from './structured-agent-session-message-projection'

type StructuredPromptCancelTarget = { itemId: string; expectedRevision: number }

export function useStructuredAgentSession(args: {
  sessionId: string
  target: RuntimeClientTarget
  agent: AgentType
  isVisible: boolean
  transportEnabled?: boolean
  /** The host has published the session but its provider has not answered startup yet. */
  providerStarting?: boolean
  /** This view started the session; only then does the stored selection name what it runs. */
  launch?: StructuredAgentSessionLaunchView
  /** The composer that gets back what a Stop withdrew. */
  composerScopeKey?: string
}) {
  const {
    agent,
    composerScopeKey,
    isVisible,
    launch,
    providerStarting = false,
    sessionId,
    target,
    transportEnabled = true
  } = args
  const { state, loadingOlder, olderHistoryGeneration, loadOlder, mutate, write, providerVisible } =
    useStructuredAgentSessionTransport({
      sessionId,
      target,
      isVisible,
      enabled: transportEnabled
    })
  const commandPending = useRef(false)
  const transportState = useStructuredAgentSessionTransportState(state, transportEnabled)
  const {
    conversationCommands,
    optionSnapshot,
    optionSurface,
    setStructuredOption,
    threadGoal: threadGoalSupport,
    contextUsage: contextUsageSupport
  } = useStructuredAgentSessionOptions({
    agent,
    sessionId,
    target,
    transportEnabled,
    isVisible,
    providerVisible,
    providerStarting,
    fence: state.fence,
    turnId: transportState.turnId,
    unloadedTurnRevisions: state.unloadedTurnRevisions,
    mutate,
    ...(launch ? { launch } : {})
  })
  const [editingId, setEditingId] = useState<string | null>(null)
  const outboxController = useStructuredAgentSessionOutbox({
    sessionId,
    target,
    fence: transportState.fence,
    submissions: transportState.submissions,
    composerScopeKey,
    hold: { turn: transportState.isWorking, editingId }
  })

  const threadGoal = useStructuredAgentSessionThreadGoal({
    journalItems: transportState.journalItems,
    support: threadGoalSupport,
    mutate
  })
  const contextUsage = useStructuredAgentSessionContextUsage(
    transportState.journalItems,
    contextUsageSupport
  )

  const railOutline = useStructuredAgentSessionRailOutline({
    sessionId,
    target,
    state,
    enabled: providerVisible
  })

  const prompts = pendingStructuredSessionPrompts(transportState.journalItems)
  const { outbox } = outboxController
  // A host that takes a Stop naming no turn gets Stop from the send until the work settles; every
  // Stop before a turn opens needs that form. An older host can stop only a turn it has opened.
  const stopsConversation =
    useStructuredAgentSessionHostStopsConversation(target) && transportState.fence !== null
  const canStop =
    transportState.turnId !== null ||
    (stopsConversation &&
      (transportState.isWorking ||
        hasUnsentStructuredAgentSessionOutboxEntry(
          outbox,
          transportState.submissions,
          outboxController.blockedClientMessageId
        )))
  const heldQueue = useStructuredAgentSessionHeldQueue({
    outbox,
    blockedClientMessageId: outboxController.blockedClientMessageId,
    working: transportState.isWorking,
    turnId: transportState.turnId,
    awaitingAnswer: prompts.length > 0,
    editingId,
    setEditingId,
    revise: outboxController.revise
  })
  const messages = useStructuredAgentSessionMessages(
    transportState.journalItems,
    outbox,
    transportState.submissions,
    heldQueue.heldIds
  )
  return {
    conversationCommands,
    runConversationCommand: (command: AgentSessionConversationCommand) =>
      structuredConversationCommands.sendStructuredConversationCommand({
        command,
        pending: commandPending,
        blocked: Boolean(
          transportState.turnId ||
          prompts.length ||
          transportState.backgroundTasks.isMonitoring ||
          outbox.length
        ),
        send: (command) =>
          write<AgentSessionConversationCommandResult>(
            'agentSession.conversationCommand',
            'agentSession.conversationCommand',
            { command }
          )
      }),
    journalItems: transportState.journalItems,
    messages,
    status: transportEnabled ? state.status : 'ready',
    /** The outbox's own line; a failed read is worded from `readRefusal`, never its text. */
    error: outboxController.error,
    /** The refusal the failed read met, while `status` is `error`. */
    readRefusal: transportEnabled ? state.readRefusal : undefined,
    hasOlder: transportEnabled && state.hasOlder,
    railOutline: transportEnabled ? railOutline : null,
    loadingOlder: transportEnabled && loadingOlder,
    olderHistoryGeneration,
    loadOlder,
    prompts,
    outbox,
    /** The journal's rows for sent messages, which carry a rejected message's whole fact. */
    submissions: transportState.submissions,
    blockedClientMessageId: outboxController.blockedClientMessageId,
    send: (...input: Parameters<typeof outboxController.send>) =>
      !commandPending.current && outboxController.send(...input),
    retry: outboxController.retry,
    isWorking: transportState.isWorking,
    workingStartedAt: transportState.turnTiming.workingStartedAt,
    settledTurns: transportState.turnTiming.settledTurns,
    activeTurnOpenedBy: transportState.turnTiming.activeTurnOpenedBy,
    turnKeysByItemId: transportState.turnTiming.turnKeysByItemId,
    turnActivity: transportState.turnActivity,
    backgroundTasks: transportState.backgroundTasks,
    turnId: transportState.turnId,
    canStop,
    heldQueue,
    stop: () => {
      heldQueue.noteStop()
      if (stopsConversation) {
        // Behind a running turn the outbox is the queue: Stop ends the turn and the next goes out
        // as it settles. With none, what the outbox holds is the work Stop takes back.
        const { turnId, submissions, fence } = transportState
        if (!isStructuredAgentSessionTurnInProgress(turnId, submissions, fence)) {
          outboxController.withdrawUnsent()
        }
        return mutate('agentSession.cancel', 'agentSession.cancel', {})
      }
      return transportState.turnId
        ? mutate('agentSession.cancel', 'agentSession.cancel', { turnId: transportState.turnId })
        : Promise.resolve(null)
    },
    cancel: async (turnId: string, prompt?: StructuredPromptCancelTarget) => {
      // Capability negotiation must complete before mutate constructs the payload
      // fingerprint and operation id: older hosts reject the strict prompt field.
      const promptSupported =
        prompt !== undefined && (await supportsStructuredAgentSessionPromptCancel(target))
      return mutate('agentSession.cancel', 'agentSession.cancel', {
        turnId,
        ...(promptSupported ? { prompt } : {})
      })
    },
    stopBackgroundTask: (taskId?: string) =>
      mutate('agentSession.cancel', 'agentSession.cancel', {
        turnId: 'background-tasks',
        scope: 'background-tasks',
        ...(taskId ? { taskId } : {})
      }),
    respond: async (item: StructuredPromptItem, response: AgentSessionPromptResponse) => {
      const promptTarget = { itemId: item.itemId, expectedRevision: item.revision }
      let fields: Record<string, unknown>
      if (response.kind === 'option') {
        fields = { ...promptTarget, optionId: response.optionId }
      } else if (await supportsStructuredAgentSessionQuestionAnswers(target)) {
        // Negotiated before mutate fingerprints the call: older hosts reject the strict field.
        fields = { ...promptTarget, answers: response.answers }
      } else {
        const optionId =
          item.body.kind === 'question'
            ? legacyAgentSessionSelectedOptionId(item.body, response.answers)
            : null
        if (optionId === null) {
          return null
        }
        fields = { ...promptTarget, optionId }
      }
      return mutate<AgentSessionPromptResult>(
        item.body.kind === 'approval'
          ? 'agentSession.respondToApproval'
          : 'agentSession.respondToQuestion',
        `agentSession.respondTo:${item.body.kind}`,
        fields
      )
    },
    optionSnapshot,
    optionSurface,
    sessionCommands: transportEnabled ? (state.commands ?? undefined) : undefined,
    setStructuredOption,
    threadGoal,
    contextUsage
  }
}
