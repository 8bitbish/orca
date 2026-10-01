import { useEffect, useRef } from 'react'
import { pairingOfferRelayInviteExpiresAt } from '../../../../shared/mobile-pairing-offer-freshness'

/** Asked for this long before the invite runs out, so a scan never meets a dead code. */
const REFRESH_LEAD_MS = 60_000
const MIN_REFRESH_DELAY_MS = 5_000

/** A Relay QR's invite expires (about 9.5 minutes); a phone scanning it after that is refused
 *  as "not a valid code". Re-mints the QR shortly before then for as long as it is shown. A
 *  LAN-only QR carries no invite and is left alone. */
export function useMobilePairingQrRefresh(pairingUrl: string | null, refresh: () => void): void {
  const refreshRef = useRef(refresh)
  useEffect(() => {
    refreshRef.current = refresh
  }, [refresh])
  useEffect(() => {
    const expiresAt = pairingUrl ? pairingOfferRelayInviteExpiresAt(pairingUrl) : null
    if (expiresAt === null) {
      return
    }
    const delay = Math.max(MIN_REFRESH_DELAY_MS, expiresAt - Date.now() - REFRESH_LEAD_MS)
    const timer = setTimeout(() => refreshRef.current(), delay)
    return () => clearTimeout(timer)
  }, [pairingUrl])
}
