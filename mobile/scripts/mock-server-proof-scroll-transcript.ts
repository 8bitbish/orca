import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { NativeChatMessage } from '../../src/shared/native-chat-types'

// Why: a long chat dense with rich cards (proof media, project and Slack cards) reproduces
// the scroll flicker Jake sees on Android. Proof bodies are read from real bundles at runtime
// so no personal paths are committed; a missing bundle is skipped.
const PROOF_ROOT = join(homedir(), '.orca-personal', 'proof')
// `MOCK_PROOF_BUNDLES` (comma-separated `project/bundle` paths) picks them; otherwise the
// newest bundles that have media, so no project names are committed.
const PROOF_BUNDLE_COUNT = 8
const PROOF_BUNDLES = process.env.MOCK_PROOF_BUNDLES
  ? process.env.MOCK_PROOF_BUNDLES.split(',').map((entry) => entry.trim())
  : newestProofBundles(PROOF_BUNDLE_COUNT)

function newestProofBundles(count: number): string[] {
  if (!existsSync(PROOF_ROOT)) {
    return []
  }
  const bundles = readdirSync(PROOF_ROOT).flatMap((project) => {
    const dir = join(PROOF_ROOT, project)
    return statSync(dir).isDirectory()
      ? readdirSync(dir).map((bundle) => `${project}/${bundle}`)
      : []
  })
  return bundles
    .filter((bundle) => /"media"\s*:\s*\[\s*\{/.test(readProofText(bundle) ?? ''))
    .sort((a, b) => b.split('/')[1].localeCompare(a.split('/')[1]))
    .slice(0, count)
}

function readProofText(bundle: string): string | null {
  try {
    return readFileSync(join(PROOF_ROOT, bundle, 'proof.json'), 'utf8')
  } catch {
    return null
  }
}

const PROSE = [
  'I looked through the change and the layout now matches the Figma frame at 393pt. The header scrolls away like the real app, and the spacing between sections is back to 24pt.',
  'Here is what I changed:\n\n- moved the badge grid into its own view\n- swapped the red tiles for the gold renders\n- kept the tap target at 44pt\n\nNothing else in the screen moved.',
  'One thing to watch: the simulator build uses iOS 26.5, so the glass button looks different from what you will see on iOS 18. I left a plain capsule fallback there.',
  'The tests pass locally (`pnpm test`), and the typecheck is clean. I did not run the device build yet.',
  'Short answer: yes. Longer answer: the old code re-measured every row on each frame, which is why it stuttered, so I cached the row heights by message id.',
  'I also checked the dark mode tokens. Every surface now reads from the semantic palette, and contrast is above 4.5:1 for body text.'
]

const USER_ASKS = [
  'can you show me it working?',
  'nice. what about the next one?',
  'and the home screen build?',
  'did the second pass land?',
  'how did that ticket go?',
  'what is the state of the migration?',
  'show me the new picker',
  'and the store screenshots?',
  'what changed?',
  'is it safe on iOS 18?',
  'did you run the tests?',
  'why was it slow before?'
]

function slackMessage(index: number): string {
  return JSON.stringify({
    status: index % 2 === 0 ? 'needs-you' : 'fyi',
    teamId: 'TFAKE0001',
    domain: 'acme',
    from: { name: 'Sam', userId: 'UFAKE0002' },
    channel: { name: 'design-review', id: 'CFAKE0003', kind: 'channel' },
    ts: `170000000${index}.000100`,
    sentAt: '2026-10-13T09:47:00+01:00',
    permalink: `https://acme.slack.com/archives/CFAKE0003/p170000000${index}000100`,
    summary:
      'Wants a call on the sidebar: overlay or push? Also asks whether the badges ship in 3.1.',
    text: 'Which do you prefer, *overlay* or _push_? And are the gold badges going into 3.1 or 3.2?',
    images: [],
    thread: { replies: 3, youReplied: false },
    actions: [
      { label: 'Overlay', reply: 'Draft a reply to Sam going with overlay', style: 'primary' },
      { label: 'Reply…', input: true }
    ]
  })
}

function slackDraft(): string {
  return JSON.stringify({
    teamId: 'TFAKE0001',
    to: { name: 'Sam', userId: 'UFAKE0002' },
    channel: { name: 'design-review', id: 'CFAKE0003' },
    threadTs: '1700000000.000100',
    text: 'Going with overlay, thanks! The gold badges are in 3.1; the confetti variant follows in 3.2.',
    actions: [
      { label: 'Send', reply: 'Send the draft to Sam', style: 'primary' },
      { label: 'Edit…', input: true },
      { label: 'Cancel', reply: 'Cancel the draft to Sam' }
    ]
  })
}

function projectCard(worktree: string, note: string, ask?: string): string {
  return JSON.stringify({
    worktree,
    note,
    ...(ask ? { ask } : {}),
    actions: [
      { label: 'Open', reply: `Open ${worktree}`, style: 'primary' },
      { label: 'Ask…', input: true }
    ]
  })
}

function fence(language: string, body: string): string {
  return `\`\`\`${language}\n${body}\n\`\`\``
}

function readProof(bundle: string): string | null {
  const file = join(PROOF_ROOT, bundle, 'proof.json')
  return existsSync(file) ? readFileSync(file, 'utf-8').trim() : null
}

const PROJECT_CARDS = [
  projectCard('orca/manta-1', 'Testing the scroll fix on the chat list', 'Merge into personal?'),
  projectCard('dashboard/narwhal-2', 'Dashboard numbers refresh every 30 s now'),
  projectCard('orca/manta-1', 'Proof card media cache warmed', 'Rebuild the APK?')
]

/** About 40 rows: each proof card follows a user ask, with prose, project and Slack cards between. */
export function proofScrollTranscript(start: number): NativeChatMessage[] {
  const messages: NativeChatMessage[] = []
  let step = 0
  const push = (role: 'user' | 'assistant', text: string) => {
    messages.push({
      id: `proof-scroll-${messages.length + 1}`,
      role,
      blocks: [{ type: 'text', text }],
      timestamp: start + step * 30_000,
      source: 'transcript'
    })
    step += 1
  }
  PROOF_BUNDLES.forEach((bundle, index) => {
    push('user', USER_ASKS[index] ?? 'next?')
    const proof = readProof(bundle)
    const intro = PROSE[index % PROSE.length] ?? ''
    push('assistant', proof ? `${intro}\n\n${fence('proof-card', proof)}` : intro)
    push('user', USER_ASKS[8 + (index % 4)] ?? 'and?')
    if (index % 3 === 0) {
      push(
        'assistant',
        `${PROSE[(index + 1) % PROSE.length]}\n\n${fence('slack-message', slackMessage(index))}`
      )
    } else if (index % 3 === 1) {
      const card = PROJECT_CARDS[index % PROJECT_CARDS.length] ?? ''
      push('assistant', `${PROSE[(index + 2) % PROSE.length]}\n\n${fence('project-card', card)}`)
    } else {
      push('assistant', `Drafted a reply for you:\n\n${fence('slack-draft', slackDraft())}`)
      push('assistant', `How the list decides:\n\n${MERMAID}`)
    }
    push('assistant', PROSE[(index + 3) % PROSE.length] ?? '')
  })
  // The bottom of the chat ends on rich cards, where Jake sees the worst flicker.
  push('user', 'summarise where everything is')
  push(
    'assistant',
    `Three projects are live:\n\n${PROJECT_CARDS.map((card) => fence('project-card', card)).join('\n\n')}`
  )
  const last = readProof(PROOF_BUNDLES[0] ?? '')
  push('assistant', last ? `And the latest proof:\n\n${fence('proof-card', last)}` : 'Done.')
  return messages
}

const MERMAID = fence(
  'mermaid',
  'flowchart TD\n  A[Open chat] --> B{At the end?}\n  B -->|yes| C[Follow new rows]\n  B -->|no| D[Hold the reading place]\n  C --> E[Stream]\n  D --> E'
)

/** The nth row of a reply streaming in at the bottom: prose, with a diagram or proof card every few. */
export function proofScrollStreamRow(index: number): NativeChatMessage {
  const prose = PROSE[index % PROSE.length] ?? ''
  const proof =
    index % 7 === 3 ? readProof(PROOF_BUNDLES[index % PROOF_BUNDLES.length] ?? '') : null
  const text =
    index % 5 === 2
      ? `${prose}\n\n${MERMAID}`
      : proof
        ? `${prose}\n\n${fence('proof-card', proof)}`
        : prose
  return {
    id: `proof-scroll-stream-${index + 1}`,
    role: 'assistant',
    blocks: [{ type: 'text', text }],
    timestamp: Date.now(),
    source: 'transcript'
  }
}
