import { describe, expect, it } from 'vitest'
import {
  AGENT_SESSION_PROMPT_CANCEL_RUNTIME_CAPABILITY,
  AGENT_SESSION_QUESTION_ANSWERS_RUNTIME_CAPABILITY,
  AGENT_SESSION_QUEUED_MESSAGES_RUNTIME_CAPABILITY,
  AGENT_SESSION_REPEATED_STOP_RUNTIME_CAPABILITY
} from '../../../src/shared/protocol-version'
import {
  TERMINAL_MESSAGE_QUEUE_RUNTIME_CAPABILITY,
  TERMINAL_MESSAGE_QUEUE_UNSUBSCRIBE_RUNTIME_CAPABILITY
} from '../../../src/shared/terminal-message-queue-capability'
import { structuredAgentSessionHostSupport } from './mobile-structured-agent-session-host-support'

describe('structuredAgentSessionHostSupport', () => {
  it('reads each structured-session feature from the host capability list', () => {
    expect(structuredAgentSessionHostSupport([])).toEqual({
      promptCancel: false,
      questionAnswers: false,
      queuedMessages: false,
      quietRepeatedStop: false,
      terminalMessageQueue: false,
      terminalMessageQueueUnsubscribe: false
    })
    expect(
      structuredAgentSessionHostSupport([AGENT_SESSION_QUESTION_ANSWERS_RUNTIME_CAPABILITY])
    ).toMatchObject({
      promptCancel: false,
      questionAnswers: true,
      queuedMessages: false,
      quietRepeatedStop: false
    })
    expect(
      structuredAgentSessionHostSupport([AGENT_SESSION_PROMPT_CANCEL_RUNTIME_CAPABILITY])
    ).toMatchObject({
      promptCancel: true,
      questionAnswers: false,
      queuedMessages: false,
      quietRepeatedStop: false
    })
    expect(
      structuredAgentSessionHostSupport([AGENT_SESSION_QUEUED_MESSAGES_RUNTIME_CAPABILITY])
    ).toMatchObject({
      promptCancel: false,
      questionAnswers: false,
      queuedMessages: true,
      quietRepeatedStop: false
    })
    expect(
      structuredAgentSessionHostSupport([AGENT_SESSION_REPEATED_STOP_RUNTIME_CAPABILITY])
    ).toMatchObject({
      promptCancel: false,
      questionAnswers: false,
      queuedMessages: false,
      quietRepeatedStop: true
    })
  })

  it('reads the terminal message queue capability', () => {
    expect(
      structuredAgentSessionHostSupport([TERMINAL_MESSAGE_QUEUE_RUNTIME_CAPABILITY])
    ).toMatchObject({ terminalMessageQueue: true, queuedMessages: false })
  })

  it('reads the terminal message queue unsubscribe capability on its own', () => {
    expect(
      structuredAgentSessionHostSupport([TERMINAL_MESSAGE_QUEUE_RUNTIME_CAPABILITY])
        .terminalMessageQueueUnsubscribe
    ).toBe(false)
    expect(
      structuredAgentSessionHostSupport([
        TERMINAL_MESSAGE_QUEUE_RUNTIME_CAPABILITY,
        TERMINAL_MESSAGE_QUEUE_UNSUBSCRIBE_RUNTIME_CAPABILITY
      ]).terminalMessageQueueUnsubscribe
    ).toBe(true)
  })
})
