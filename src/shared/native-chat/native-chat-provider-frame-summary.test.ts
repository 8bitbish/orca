import { describe, expect, it } from 'vitest'
import {
  isWordlessProviderFrame,
  type ProviderFrameRowText
} from './native-chat-provider-frame-summary'

function frameRow(provider: string, kind: string, extra: Partial<ProviderFrameRowText> = {}) {
  return { text: `${provider} · ${kind}`, providerFrame: { provider, kind }, ...extra }
}

describe('isWordlessProviderFrame', () => {
  it('hides the start-up snapshot an older host stored as an error row, but not other errors', () => {
    expect(
      isWordlessProviderFrame(frameRow('claude', 'message:system:init', { tone: 'error' }))
    ).toBe(true)
    expect(
      isWordlessProviderFrame(frameRow('claude', 'message:system:status', { tone: 'error' }))
    ).toBe(false)
  })
})
