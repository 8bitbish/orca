import { describe, expect, it } from 'vitest'
import {
  collectNativeChatSlackUnnamedMentions,
  missingNativeChatSlackNames,
  parseNativeChatSlackNamesResult
} from './native-chat-slack-names-contract'

describe('Slack mention names', () => {
  it('collects only unlabelled mentions, once each, inside formatting too', () => {
    expect(
      collectNativeChatSlackUnnamedMentions(
        '<@UFAKE0010> *<@UFAKE0011>* <@UFAKE0010> <@UFAKE0012|Grace> <#CFAKE0013> <#CFAKE0014|ops> `<@UFAKE0015>`'
      )
    ).toEqual({ userIds: ['UFAKE0010', 'UFAKE0011'], channelIds: ['CFAKE0013'] })
  })

  it('skips ids the card already names', () => {
    expect(
      missingNativeChatSlackNames('<@UFAKE0010> <@UFAKE0002> <#CFAKE0003>', {
        users: { UFAKE0002: 'Sam' },
        channels: { CFAKE0003: 'design-review' }
      })
    ).toEqual({ userIds: ['UFAKE0010'], channelIds: [] })
  })

  it('keeps only well-formed pairs from a host reply', () => {
    expect(
      parseNativeChatSlackNamesResult({
        users: { UFAKE0010: ' Ada ', bad: 'x', UFAKE0011: 7, UFAKE0012: 'x'.repeat(81) },
        channels: { CFAKE0013: 'launch' }
      })
    ).toEqual({ users: { UFAKE0010: 'Ada' }, channels: { CFAKE0013: 'launch' } })
    expect(parseNativeChatSlackNamesResult(null)).toBeNull()
    expect(parseNativeChatSlackNamesResult({ users: {} })).toBeNull()
  })
})
