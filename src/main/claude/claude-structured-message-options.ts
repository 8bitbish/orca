import { claudeStartedUnechoedSend } from './claude-command-lifecycle'
import { claudeExecutionObservations } from './claude-structured-execution-observations'
import { dispatchClaudeTurn } from './claude-structured-dispatch'
import type { StructuredAgentSessionAdapter } from '../native-chat/agent-session-wire/structured-agent-session-adapter'
import type { AgentSessionExecutionOptions } from '../../shared/agent-session-execution-options'
import { AgentSessionOptionRejectedError } from '../native-chat/agent-session-wire/structured-agent-session-option-error'
import {
  createStructuredAgentSessionLogger,
  neverThrowingStructuredAgentSessionLogger,
  type StructuredAgentSessionLogger
} from '../native-chat/agent-session-wire/structured-agent-session-logger'
import { listedModels } from './claude-structured-model-catalog'
import { setClaudeStructuredOption } from './claude-structured-options'
import type { ClaudeSession } from './structured/claude-structured-session-state'
import {
  isAbortSignalReason,
  throwIfSignalAborted,
  waitForPromiseWithSignal
} from '../../shared/abort-signal-reason'

const defaultLogger = createStructuredAgentSessionLogger()

export async function applyClaudeMessageOptions(
  session: ClaudeSession,
  options: AgentSessionExecutionOptions,
  timeoutMs: number | undefined,
  signal?: AbortSignal,
  logger: StructuredAgentSessionLogger = defaultLogger
): Promise<void> {
  throwIfSignalAborted(signal)
  const model = options.model ?? (await defaultModelForMessage(session, timeoutMs, signal, logger))
  if (model && session.appliedInputOptions.get('model') !== model) {
    await waitForPromiseWithSignal(
      setClaudeStructuredOption(session, { key: 'model', value: model }, timeoutMs),
      signal
    )
  }

  throwIfSignalAborted(signal)
  const effort = options.effort ?? session.configuredDefaults?.effort
  if (effort && session.appliedInputOptions.get('effort') !== effort) {
    await waitForPromiseWithSignal(
      setClaudeStructuredOption(session, { key: 'effort', value: effort }, timeoutMs),
      signal
    )
  } else if (!effort && session.options.has('effort')) {
    // Unknown configured effort can't be restored; send on Claude's current effort rather than drop the message.
    neverThrowingStructuredAgentSessionLogger(logger).warn(
      'Claude did not report its configured effort; sending on its current effort',
      { scope: 'claude-message-options' }
    )
  }

  throwIfSignalAborted(signal)
  const fastMode = options.fastMode
  if (fastMode !== undefined && session.appliedInputOptions.get('fastMode') !== fastMode) {
    await waitForPromiseWithSignal(
      setClaudeStructuredOption(session, { key: 'fastMode', value: fastMode }, timeoutMs),
      signal
    )
  }
  throwIfSignalAborted(signal)
}

async function defaultModelForMessage(
  session: ClaudeSession,
  timeoutMs: number | undefined,
  signal: AbortSignal | undefined,
  logger: StructuredAgentSessionLogger
): Promise<string | undefined> {
  if (session.configuredDefaults?.model) {
    return session.configuredDefaults.model
  }
  if (!session.options.has('model')) {
    return undefined
  }
  const response = await waitForPromiseWithSignal(
    session.connection.supportedModels({ timeoutMs }),
    signal
  ).catch(() => null)
  throwIfSignalAborted(signal)
  const listed = listedModels(response ? { models: response } : null)
  const fallback = listed.find((model) => model.isDefault)?.id
  if (!fallback) {
    neverThrowingStructuredAgentSessionLogger(logger).warn(
      'Claude did not report its default model; sending on its current model',
      { scope: 'claude-message-options' }
    )
  }
  return fallback
}

export async function dispatchClaudeMessage(
  session: ClaudeSession,
  input: Parameters<StructuredAgentSessionAdapter['dispatch']>[0],
  timeoutMs: number | undefined,
  logger: StructuredAgentSessionLogger = defaultLogger
): ReturnType<StructuredAgentSessionAdapter['dispatch']> {
  let ranOptions: Record<string, string> = {}
  const outcome = await dispatchClaudeTurn(session, input, async () => {
    await input.beforeDispatch?.()
    try {
      input.signal?.throwIfAborted()
      // Input joining a running turn, and Orca mail notices, run on the choices Claude already has;
      // new choices apply at the next new turn.
      const messageOptions =
        session.translator?.openTurnHasInputWork ||
        session.translator?.commandTurnId ||
        claudeStartedUnechoedSend(session) ||
        input.body.from?.orchestration?.message === 'mail-notice'
          ? undefined
          : input.executionOptions
      input.onInputPreparation?.()
      if (messageOptions !== undefined) {
        await applyClaudeMessageOptions(session, messageOptions, timeoutMs, input.signal, logger)
      }
      input.signal?.throwIfAborted()
      input.onExecutionSnapshot?.()
      ranOptions = claudeExecutionObservations(session)
      if (messageOptions?.model && ranOptions.model !== messageOptions.model) {
        delete ranOptions.model
      }
    } catch (error) {
      neverThrowingStructuredAgentSessionLogger(logger).warn(
        'applying Claude message choices failed',
        {
          scope: 'claude-message-options',
          sessionId: input.sessionId,
          clientMessageId: input.clientMessageId,
          error
        }
      )
      throw error instanceof AgentSessionOptionRejectedError ||
        isAbortSignalReason(input.signal, error)
        ? error
        : new AgentSessionOptionRejectedError(error)
    }
  })
  // Keep an explicit snapshot, even empty, to prevent fallback to configured choices.
  return outcome.state === 'accepted' || outcome.state === 'admitted'
    ? { ...outcome, ranOptions }
    : outcome
}
