// Test-only page script that run-proof-scroll-test.sh adds to a copy of the mobile web bundle. It
// reports the chat's real scroll geometry to the mock host (method `probe.scroll`, written to
// MOCK_PROBE_LOG) as `<kind> <epoch ms> <json>` lines, which proof-scroll-jumps.mjs checks.
;(() => {
  const lines = []
  const log = (kind, data) => lines.push(`${kind} ${Date.now()} ${JSON.stringify(data)}`)
  const id = () =>
    Array.from(
      { length: 22 },
      () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]
    ).join('')
  // Through the shell's own channel: the page's WebView has no console or devtools to read. One
  // batch in flight, kept until the host answers it: the shell refuses requests past its in-flight
  // window, which the page's own media loads fill while rows are drawn.
  let pending = null
  const send = () => {
    if (pending || lines.length === 0 || !globalThis.orcaBridge) {
      return
    }
    pending = { id: id(), lines: lines.splice(0, 200), sentAt: Date.now() }
    globalThis.orcaBridge.postMessage(
      JSON.stringify({
        v: 1,
        type: 'request',
        id: pending.id,
        method: 'probe.scroll',
        params: { lines: pending.lines }
      })
    )
  }
  const retry = () => {
    lines.unshift(...pending.lines)
    pending = null
  }
  globalThis.orcaBridge?.addEventListener?.('message', (event) => {
    let frame
    try {
      frame = JSON.parse(event.data)
    } catch {
      return
    }
    if (pending && frame?.id === pending.id) {
      if (frame.type === 'reply') {
        pending = null
      } else if (frame.type === 'error') {
        retry()
      }
    }
  })
  setInterval(() => {
    if (pending && Date.now() - pending.sentAt > 3000) {
      retry()
    }
    send()
  }, 300)

  let scroller = null
  let last = null
  const geometry = (s) => ({
    top: Math.round(s.scrollTop),
    fromEnd: Math.round(s.scrollHeight - s.clientHeight - s.scrollTop),
    sh: s.scrollHeight
  })
  document.addEventListener(
    'scroll',
    (event) => {
      const s = event.target
      if (!(s instanceof Element) || s.scrollHeight < 2 * s.clientHeight) {
        return
      }
      scroller = s
      const now = geometry(s)
      log('scroll', { ...now, d: last === null ? 0 : now.top - last })
      last = now.top
    },
    { capture: true, passive: true }
  )
  // Content can grow below a parked reader with no scroll event, so the end is also sampled.
  setInterval(() => scroller && log('tick', geometry(scroller)), 250)
  for (const type of ['touchstart', 'touchend']) {
    document.addEventListener(type, () => log(type, {}), {
      capture: true,
      passive: true
    })
  }

  // Each chat row's height when drawn, and when it changes by a visible amount.
  const heights = new WeakMap()
  const rows = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const h = Math.round(entry.contentRect.height)
      const was = heights.get(entry.target)
      heights.set(entry.target, h)
      const row = (entry.target.getAttribute('data-testid') ?? '').slice('chat-row:'.length)
      if (was === undefined) {
        log('rowmount', { row, h })
      } else if (h > 0 && Math.abs(h - was) >= 20) {
        log('rowsize', { row, was, h })
      }
    }
  })
  const watched = new WeakSet()
  setInterval(() => {
    for (const element of document.querySelectorAll('[data-testid^="chat-row:"]')) {
      if (!watched.has(element)) {
        watched.add(element)
        rows.observe(element)
      }
    }
  }, 50)
})()
