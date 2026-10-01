import { describe, expect, it } from 'vitest'
import { pairingRefusalMessage } from './pairing-refusal-message'

const NOW = 1_790_000_000_000

function relayUrl(inviteExpiresAt: number): string {
  const json = JSON.stringify({ v: 2, endpoint: 'ws://x', relay: { v: 1, inviteExpiresAt } })
  return `orca://pair?code=${btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`
}

describe('pairingRefusalMessage', () => {
  it('says an expired code has expired', () => {
    expect(pairingRefusalMessage(relayUrl(NOW - 1000), 'fallback', NOW)).toMatch(/has expired/)
  })

  it('blames a slow phone clock for an invite too far in the future', () => {
    expect(pairingRefusalMessage(relayUrl(NOW + 15 * 60_000), 'fallback', NOW)).toMatch(
      /clock is behind/
    )
  })

  it('keeps the caller’s message for anything else', () => {
    expect(pairingRefusalMessage('https://example.com', 'fallback', NOW)).toBe('fallback')
  })
})
