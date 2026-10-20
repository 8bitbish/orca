// Fails a proof-scroll run on scroll jumps, read from what proof-scroll-probe.js saw in the page.
//
//   node mobile/scripts/proof-scroll-jumps.mjs <probe.log> <phases.json>
//
// phases.json: [{ "name", "from", "to", "checks": [...] }], epoch ms. Checks:
//   back  the view moves toward the top by `TOLERANCE` px or more (the reader only moves it down)
//   still the view moves at all
//   end   the view is not at the end when the phase is over
// Every phase also fails when a chat row is drawn again at another height than it last had: that
// difference is what the list's spacer and the pinned end turn into a jump.
import { readFileSync } from 'node:fs'

const TOLERANCE = 24
const AT_END = 2
// The emulator's clock and the host's drift a little, so each phase's edges are left out.
const EDGE_MS = 250

const [probeFile, phasesFile] = process.argv.slice(2)
if (!probeFile || !phasesFile) {
  console.error('usage: proof-scroll-jumps.mjs <probe.log> <phases.json>')
  process.exit(2)
}
const phases = JSON.parse(readFileSync(phasesFile, 'utf8'))
const events = readFileSync(probeFile, 'utf8')
  .split('\n')
  // A batch the probe resent after a slow answer can arrive twice.
  .filter((line, at, all) => line && all.indexOf(line) === at)
  .map((line) => {
    const [kind, at, ...json] = line.split(' ')
    return { kind, at: Number(at), data: JSON.parse(json.join(' ')) }
  })
  .sort((a, b) => a.at - b.at)
if (!events.some(({ kind }) => kind === 'scroll' || kind === 'tick')) {
  console.error(`no scroll samples in ${probeFile}: did the page bundle load with the probe?`)
  process.exit(2)
}

// The height each row last had, so a remount can be compared with it.
const heights = new Map()
const redrawn = []
for (const { kind, at, data } of events) {
  if (kind === 'rowmount' && data.h > 0) {
    const was = heights.get(data.row)
    if (was !== undefined && Math.abs(was - data.h) >= TOLERANCE) {
      redrawn.push({
        at,
        text: `${data.row} redrawn at ${data.h}px, was ${was}px`
      })
    }
  }
  if ((kind === 'rowmount' || kind === 'rowsize') && data.h > 0) {
    heights.set(data.row, data.h)
  }
}

const seconds = (at) => ((at - phases[0].from) / 1000).toFixed(1)
let failed = false
for (const phase of phases) {
  const [from, to] = [phase.from + EDGE_MS, phase.to - EDGE_MS]
  const inside = events.filter(({ at }) => at >= from && at <= to)
  const moves = inside.filter(({ kind }) => kind === 'scroll')
  const problems = redrawn
    .filter(({ at }) => at >= from && at <= to)
    .map(({ at, text }) => `${seconds(at)}s ${text}`)
  for (const { at, data } of moves) {
    if (phase.checks.includes('back') && data.d <= -TOLERANCE) {
      problems.push(`${seconds(at)}s jumped back ${-data.d}px (now ${data.fromEnd}px from the end)`)
    }
    if (phase.checks.includes('still') && Math.abs(data.d) >= 2) {
      problems.push(`${seconds(at)}s moved ${data.d}px while idle`)
    }
  }
  if (phase.checks.includes('end')) {
    const last = events.findLast(
      ({ kind, at }) => (kind === 'scroll' || kind === 'tick') && at <= to
    )
    if (!last || last.data.fromEnd > AT_END) {
      problems.push(`not at the end afterwards (${last ? last.data.fromEnd : '?'}px above it)`)
    }
  }
  const summary = `${moves.length} moves, net ${moves.reduce((sum, { data }) => sum + data.d, 0)}px`
  console.log(`${problems.length ? 'JUMP' : 'ok  '} ${phase.name} (${summary})`)
  for (const problem of problems) {
    console.log(`       ${problem}`)
  }
  failed ||= problems.length > 0
}
process.exit(failed ? 1 : 0)
