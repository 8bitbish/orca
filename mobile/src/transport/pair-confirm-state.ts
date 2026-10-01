import { parsePairingCode } from './pairing'
import { pairingRefusalMessage } from './pairing-refusal-message'
import type { PairingOffer } from './types'

export type PairConfirmRouteState =
  | { kind: 'ready'; offer: PairingOffer; errorMessage: '' }
  | { kind: 'error'; offer: null; errorMessage: string }

export function resolvePairConfirmRouteState(code: string | undefined): PairConfirmRouteState {
  if (!code) {
    return { kind: 'error', offer: null, errorMessage: 'Missing pairing code' }
  }

  const offer = parsePairingCode(code)
  if (!offer) {
    return {
      kind: 'error',
      offer: null,
      errorMessage: pairingRefusalMessage(code, 'Not a valid pairing code')
    }
  }

  return { kind: 'ready', offer, errorMessage: '' }
}
