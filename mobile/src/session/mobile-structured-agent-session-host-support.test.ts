import { describe, expect, it } from 'vitest'
import {
  AGENT_SESSION_PROMPT_CANCEL_RUNTIME_CAPABILITY,
  AGENT_SESSION_QUESTION_ANSWERS_RUNTIME_CAPABILITY,
  TERMINAL_MESSAGE_QUEUE_RUNTIME_CAPABILITY
} from '../../../src/shared/protocol-version'
import { structuredAgentSessionHostSupport } from './mobile-structured-agent-session-host-support'

describe('structuredAgentSessionHostSupport', () => {
  it('reads each structured-session feature from the host capability list', () => {
    expect(structuredAgentSessionHostSupport([])).toEqual({
      promptCancel: false,
      questionAnswers: false,
      terminalMessageQueue: false
    })
    expect(
      structuredAgentSessionHostSupport([AGENT_SESSION_QUESTION_ANSWERS_RUNTIME_CAPABILITY])
    ).toEqual({ promptCancel: false, questionAnswers: true, terminalMessageQueue: false })
    expect(
      structuredAgentSessionHostSupport([AGENT_SESSION_PROMPT_CANCEL_RUNTIME_CAPABILITY])
    ).toEqual({ promptCancel: true, questionAnswers: false, terminalMessageQueue: false })
  })

  it('reads the terminal message queue capability', () => {
    expect(
      structuredAgentSessionHostSupport([TERMINAL_MESSAGE_QUEUE_RUNTIME_CAPABILITY])
        .terminalMessageQueue
    ).toBe(true)
  })
})
