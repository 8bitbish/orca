// When a pairing code's Relay invite runs out, read without the schema. The schema
// rejects an expired or implausibly distant invite outright, which a scanner then
// reports as "not an Orca code"; reading the expiry on its own lets the desktop
// refresh the QR before it dies and the phone say what is actually wrong.
// atob, not Buffer: this runs in the renderer and in Hermes too.

import { INVITE_EXPIRY_CLOCK_SKEW_MS, MAX_INVITE_TTL_MS } from './mobile-relay-pairing-offer'

function pairingCodeOf(input: string): string | null {
  const trimmed = input.trim()
  if (!/^orca:\/\//i.test(trimmed)) {
    return trimmed || null
  }
  const match = /[?&]code=([^&#]+)/.exec(trimmed) ?? /#(.+)$/.exec(trimmed)
  return match?.[1] ?? null
}

function readPayload(input: string): unknown {
  const code = pairingCodeOf(input)
  if (!code) {
    return null
  }
  try {
    const base64 = code.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
    return JSON.parse(atob(padded))
  } catch {
    return null
  }
}

/** The Relay invite's expiry (ms since epoch), or null for a code with no Relay invite. */
export function pairingOfferRelayInviteExpiresAt(input: string): number | null {
  const payload = readPayload(input)
  if (typeof payload !== 'object' || payload === null || !('relay' in payload)) {
    return null
  }
  const { relay } = payload
  if (typeof relay !== 'object' || relay === null || !('inviteExpiresAt' in relay)) {
    return null
  }
  const { inviteExpiresAt } = relay
  return typeof inviteExpiresAt === 'number' && Number.isFinite(inviteExpiresAt)
    ? inviteExpiresAt
    : null
}

/** Why a pairing code the schema refused was refused, as far as the expiry can tell. */
export type PairingOfferRefusal = 'expired' | 'clock-behind' | 'invalid'

export function classifyPairingOfferRefusal(input: string, now: number): PairingOfferRefusal {
  const expiresAt = pairingOfferRelayInviteExpiresAt(input)
  if (expiresAt === null) {
    return 'invalid'
  }
  if (expiresAt <= now) {
    return 'expired'
  }
  // An invite never lasts longer than this, so a later expiry means this clock runs slow.
  return expiresAt > now + MAX_INVITE_TTL_MS + INVITE_EXPIRY_CLOCK_SKEW_MS
    ? 'clock-behind'
    : 'invalid'
}
