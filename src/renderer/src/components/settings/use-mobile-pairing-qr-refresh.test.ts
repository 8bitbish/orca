// @vitest-environment happy-dom
import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useMobilePairingQrRefresh } from './use-mobile-pairing-qr-refresh'

const NOW = 1_790_000_000_000

function relayUrl(inviteExpiresAt: number): string {
  const json = JSON.stringify({ v: 2, endpoint: 'ws://x', relay: { v: 1, inviteExpiresAt } })
  return `orca://pair?code=${btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useMobilePairingQrRefresh', () => {
  it('re-mints a Relay QR a minute before its invite expires', () => {
    const refresh = vi.fn()
    renderHook(() => useMobilePairingQrRefresh(relayUrl(NOW + 9.5 * 60_000), refresh))
    vi.advanceTimersByTime(8.5 * 60_000 - 1)
    expect(refresh).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('leaves a LAN-only QR and a cleared QR alone', () => {
    const refresh = vi.fn()
    const lan = `orca://pair?code=${btoa(JSON.stringify({ v: 2 }))}`
    const initialProps: { url: string | null } = { url: lan }
    const { rerender } = renderHook(({ url }) => useMobilePairingQrRefresh(url, refresh), {
      initialProps
    })
    rerender({ url: null })
    vi.advanceTimersByTime(60 * 60_000)
    expect(refresh).not.toHaveBeenCalled()
  })

  it('drops the pending refresh when the QR changes or the pane closes', () => {
    const refresh = vi.fn()
    const { rerender, unmount } = renderHook(({ url }) => useMobilePairingQrRefresh(url, refresh), {
      initialProps: { url: relayUrl(NOW + 2 * 60_000) }
    })
    rerender({ url: relayUrl(NOW + 9.5 * 60_000) })
    vi.advanceTimersByTime(2 * 60_000)
    expect(refresh).not.toHaveBeenCalled()
    unmount()
    vi.advanceTimersByTime(60 * 60_000)
    expect(refresh).not.toHaveBeenCalled()
  })
})
