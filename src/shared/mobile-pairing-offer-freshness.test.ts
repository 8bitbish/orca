import { describe, expect, it } from 'vitest'
import {
  classifyPairingOfferRefusal,
  pairingOfferRelayInviteExpiresAt
} from './mobile-pairing-offer-freshness'

const NOW = 1_790_000_000_000

function code(payload: unknown): string {
  return Buffer.from(JSON.stringify(payload), 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function relayUrl(inviteExpiresAt: number): string {
  return `orca://pair?code=${code({ v: 2, endpoint: 'ws://x', relay: { v: 1, inviteExpiresAt } })}`
}

describe('pairing offer freshness', () => {
  it('reads the Relay invite expiry from a URL or a bare code', () => {
    expect(pairingOfferRelayInviteExpiresAt(relayUrl(NOW + 1000))).toBe(NOW + 1000)
    expect(pairingOfferRelayInviteExpiresAt(code({ relay: { inviteExpiresAt: NOW + 5 } }))).toBe(
      NOW + 5
    )
  })

  it('has no expiry for a LAN-only code or garbage', () => {
    expect(pairingOfferRelayInviteExpiresAt(`orca://pair?code=${code({ v: 2 })}`)).toBeNull()
    expect(pairingOfferRelayInviteExpiresAt('https://example.com')).toBeNull()
    expect(pairingOfferRelayInviteExpiresAt('orca://pair?code=%%%')).toBeNull()
  })

  it('tells an expired invite from a slow clock from anything else', () => {
    expect(classifyPairingOfferRefusal(relayUrl(NOW - 1), NOW)).toBe('expired')
    expect(classifyPairingOfferRefusal(relayUrl(NOW + 11 * 60_000), NOW)).toBe('clock-behind')
    expect(classifyPairingOfferRefusal(relayUrl(NOW + 5 * 60_000), NOW)).toBe('invalid')
    expect(classifyPairingOfferRefusal('not a code', NOW)).toBe('invalid')
  })
})
