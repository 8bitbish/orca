import { classifyPairingOfferRefusal } from '../../../src/shared/mobile-pairing-offer-freshness'
import type { Translate } from '../i18n/mobile-i18n'
import { getPairingScanErrorMessage } from './pairing-scan-error-message'

/** What to tell someone whose pairing code was refused, when its Relay invite says why. */
export function pairingRefusalMessage(input: string, fallback: string, now = Date.now()): string {
  switch (classifyPairingOfferRefusal(input, now)) {
    case 'expired':
      return 'This code has expired. Show a new one on your computer (close and reopen Settings → Mobile), then scan again.'
    case 'clock-behind':
      return "This phone's clock is behind, so the code isn't valid yet here. Turn on automatic date and time, then scan again."
    case 'invalid':
      return fallback
  }
}

/** The pair screen's message for a scanned code it could not use. */
export function scannedPairingRefusalMessage(data: string, t: Translate): string {
  return pairingRefusalMessage(data, getPairingScanErrorMessage(data, t))
}

/** The pair screen's message for a pasted code it could not use. */
export function pastedPairingRefusalMessage(input: string, t: Translate): string {
  return pairingRefusalMessage(
    input,
    t(
      'app.pairScan.invalidPairingCode',
      'Not a valid pairing code — copy it from your computer and paste again'
    )
  )
}
