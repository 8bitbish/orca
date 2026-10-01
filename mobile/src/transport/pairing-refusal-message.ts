import { classifyPairingOfferRefusal } from '../../../src/shared/mobile-pairing-offer-freshness'

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
