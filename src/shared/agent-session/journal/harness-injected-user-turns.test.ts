import { describe, expect, it } from 'vitest'

import {
  isHarnessTurnOpenerText,
  isKnownHarnessInjectedUserTurnText
} from './harness-injected-user-turns'

describe('isHarnessTurnOpenerText', () => {
  it.each([
    '<task-notification>\n<task-id>b1</task-id>',
    '  <command-message>design-token-audit</command-message>\n<command-name>/design-token-audit',
    '<bash-input>ls</bash-input>',
    'Another Claude session sent a message:\n<agent-message from="a1">report'
  ])('opens a turn: %s', (text) => {
    expect(isHarnessTurnOpenerText(text)).toBe(true)
    expect(isKnownHarnessInjectedUserTurnText(text)).toBe(true)
  })

  it.each([
    '<system-reminder>\nThe task list is empty.',
    '<command-name>/model</command-name>\n<command-message>model</command-message>',
    '<local-command-stdout>Set model</local-command-stdout>',
    '[Request interrupted by user]',
    'please look at <task-notification> handling'
  ])('does not open a turn: %s', (text) => {
    expect(isHarnessTurnOpenerText(text)).toBe(false)
  })
})
