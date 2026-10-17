import { describe, expect, it } from 'vitest'
import {
  AGENT_SESSION_CONVERSATION_STOP_RUNTIME_CAPABILITY,
  AGENT_SESSION_PROMPT_CANCEL_RUNTIME_CAPABILITY,
  AGENT_SESSION_QUESTION_ANSWERS_RUNTIME_CAPABILITY,
  AGENT_SESSION_QUEUED_COMMANDS_RUNTIME_CAPABILITY,
  AGENT_SESSION_QUEUED_MESSAGES_RUNTIME_CAPABILITY,
  AGENT_SESSION_STATUS_FEED_RUNTIME_CAPABILITY,
  AGENT_SESSION_REPEATED_STOP_RUNTIME_CAPABILITY
} from '../../../src/shared/protocol-version'
import { AGENT_SESSION_SEND_OPTIONS_RUNTIME_CAPABILITY } from '../../../src/shared/agent-session-create-capabilities'
import {
  TERMINAL_MESSAGE_QUEUE_RUNTIME_CAPABILITY,
  TERMINAL_MESSAGE_QUEUE_UNSUBSCRIBE_RUNTIME_CAPABILITY
} from '../../../src/shared/terminal-message-queue-capability'
import { AGENT_SESSION_PERMISSION_MODES_RUNTIME_CAPABILITY } from '../../../src/shared/agent-session-permission-modes-capability'
import { structuredAgentSessionHostSupport } from './mobile-structured-agent-session-host-support'

describe('structuredAgentSessionHostSupport', () => {
  it('reads each structured-session feature from the host capability list', () => {
    const none = {
      promptCancel: false,
      questionAnswers: false,
      queuedMessages: false,
      queuedCommands: false,
      quietRepeatedStop: false,
      statusFeed: false,
      sendOptions: false,
      conversationStop: false,
      terminalMessageQueue: false,
      terminalMessageQueueUnsubscribe: false,
      permissionModes: false
    }
    expect(structuredAgentSessionHostSupport([])).toEqual(none)
    expect(
      structuredAgentSessionHostSupport([AGENT_SESSION_QUESTION_ANSWERS_RUNTIME_CAPABILITY])
    ).toEqual({ ...none, questionAnswers: true })
    expect(
      structuredAgentSessionHostSupport([AGENT_SESSION_PROMPT_CANCEL_RUNTIME_CAPABILITY])
    ).toEqual({ ...none, promptCancel: true })
    expect(
      structuredAgentSessionHostSupport([AGENT_SESSION_QUEUED_MESSAGES_RUNTIME_CAPABILITY])
    ).toEqual({ ...none, queuedMessages: true })
    expect(
      structuredAgentSessionHostSupport([AGENT_SESSION_QUEUED_COMMANDS_RUNTIME_CAPABILITY])
    ).toEqual({ ...none, queuedCommands: true })
    expect(
      structuredAgentSessionHostSupport([AGENT_SESSION_REPEATED_STOP_RUNTIME_CAPABILITY])
    ).toEqual({ ...none, quietRepeatedStop: true })
    expect(
      structuredAgentSessionHostSupport([AGENT_SESSION_STATUS_FEED_RUNTIME_CAPABILITY])
    ).toEqual({ ...none, statusFeed: true })
    expect(
      structuredAgentSessionHostSupport([AGENT_SESSION_SEND_OPTIONS_RUNTIME_CAPABILITY])
    ).toEqual({ ...none, sendOptions: true })
    expect(
      structuredAgentSessionHostSupport([AGENT_SESSION_CONVERSATION_STOP_RUNTIME_CAPABILITY])
    ).toEqual({ ...none, conversationStop: true })
    expect(
      structuredAgentSessionHostSupport([AGENT_SESSION_PERMISSION_MODES_RUNTIME_CAPABILITY])
    ).toEqual({ ...none, permissionModes: true })
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
