// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NativeChatShellRunBlock } from '../../../../shared/native-chat-shell-run-block'
import {
  createNativeChatShellRunEngine,
  type NativeChatShellRunWorkspace
} from './native-chat-shell-run-engine'
import type { NativeChatShellRunScreen } from './native-chat-shell-run-screen'
import {
  getNativeChatShellRun,
  resetNativeChatShellRunStoreForTests
} from './native-chat-shell-run-store'
import type {
  NativeChatShellRunStream,
  NativeChatShellRunTransport
} from './native-chat-shell-run-transport'

const RUN_ID = 'run000000001'
const START = `\u001b]777;orca-chat-run-start;${RUN_ID}\u0007`
const end = (code: number, id = RUN_ID): string =>
  `\u001b]777;orca-chat-run-end;${id};${code}\u0007`
const BLOCK: NativeChatShellRunBlock = { script: 'ls', interpreter: 'auto', workspaceTarget: null }
const WORKSPACE: NativeChatShellRunWorkspace = {
  worktreeId: 'repo::/work/app',
  path: '/work/app',
  target: { kind: 'local' }
}

function fakeScreen(): NativeChatShellRunScreen {
  let text = ''
  return {
    write: async (data) => {
      text += data.replace(/\r\n/g, '\n')
    },
    text: () => text.replace(/\n+$/, ''),
    cursorLine: () => text.split('\n').at(-1) ?? '',
    dispose: () => {}
  }
}

function fakeTransport(options: { busy?: boolean; createFails?: boolean } = {}) {
  const streams = new Map<string, NativeChatShellRunStream>()
  const terminals = new Map<string, { worktreeId: string }>()
  let created = 0
  const transport = {
    find: vi.fn(async (_target, handle: string) => {
      const terminal = terminals.get(handle)
      return terminal
        ? { handle, worktreeId: terminal.worktreeId, busy: options.busy === true }
        : null
    }),
    create: vi.fn(async (_target, args: { worktreeId: string; command: string }) => {
      if (options.createFails) {
        throw new Error('runtime_unavailable')
      }
      created += 1
      const handle = `term_${created}`
      terminals.set(handle, { worktreeId: args.worktreeId })
      return { handle }
    }),
    subscribe: vi.fn(async (_target, handle: string, stream: NativeChatShellRunStream) => {
      streams.set(handle, stream)
      return () => streams.delete(handle)
    }),
    send: vi.fn(async () => true),
    interrupt: vi.fn(async () => {}),
    focus: vi.fn(async () => {})
  } satisfies NativeChatShellRunTransport
  return {
    transport,
    emit: (handle: string, data: string) => streams.get(handle)?.onData(data),
    close: (handle: string) => streams.get(handle)?.onEnd(),
    subscribed: (handle: string) => streams.has(handle)
  }
}

function engineWith(fake: ReturnType<typeof fakeTransport>, ids = [RUN_ID]) {
  let clock = 1_000
  const queue = [...ids]
  const engine = createNativeChatShellRunEngine({
    transport: fake.transport,
    createScreen: fakeScreen,
    now: () => clock,
    randomId: () => queue.shift() ?? RUN_ID
  })
  return { engine, advance: (ms: number) => (clock += ms) }
}

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  resetNativeChatShellRunStoreForTests()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('native chat shell run engine', () => {
  it('opens a background Runs terminal, mirrors the output, and reports the exit code and duration', async () => {
    const fake = fakeTransport()
    const { engine, advance } = engineWith(fake)
    expect(await engine.start('k', BLOCK, WORKSPACE)).toBe(true)
    expect(fake.transport.create).toHaveBeenCalledWith(WORKSPACE.target, {
      worktreeId: WORKSPACE.worktreeId,
      command: expect.stringContaining(` ${RUN_ID} auto `)
    })
    expect(getNativeChatShellRun('k')).toMatchObject({
      phase: 'starting',
      terminalHandle: 'term_1'
    })

    fake.emit('term_1', `% sh -c '...'\r\n${START}`)
    expect(getNativeChatShellRun('k').phase).toBe('running')
    fake.emit('term_1', 'README.md\r\nsrc\r\n')
    await vi.advanceTimersByTimeAsync(100)
    expect(getNativeChatShellRun('k').output).toBe('README.md\nsrc')

    advance(1_500)
    fake.emit('term_1', `${end(0)}% `)
    await vi.advanceTimersByTimeAsync(0)
    const run = getNativeChatShellRun('k')
    expect(run).toMatchObject({ phase: 'succeeded', exitCode: 0, output: 'README.md\nsrc' })
    expect((run.endedAt ?? 0) - (run.startedAt ?? 0)).toBe(1_500)
    expect(fake.subscribed('term_1')).toBe(false)
  })

  it('reuses the workspace’s Runs terminal for the next run', async () => {
    const fake = fakeTransport()
    const { engine } = engineWith(fake, [RUN_ID, 'run000000002'])
    await engine.start('k', BLOCK, WORKSPACE)
    fake.emit('term_1', `${START}${end(1)}`)
    await vi.advanceTimersByTimeAsync(0)
    expect(getNativeChatShellRun('k')).toMatchObject({ phase: 'failed', exitCode: 1 })

    expect(await engine.start('other-block', BLOCK, WORKSPACE)).toBe(true)
    expect(fake.transport.create).toHaveBeenCalledTimes(1)
    expect(fake.transport.subscribe).toHaveBeenCalledTimes(2)
    expect(fake.transport.send).toHaveBeenCalledWith(
      WORKSPACE.target,
      'term_1',
      expect.stringContaining(' run000000002 ')
    )
  })

  it('never double-starts a block, and keeps one run per workspace terminal', async () => {
    const fake = fakeTransport()
    const { engine } = engineWith(fake)
    const [first, second] = await Promise.all([
      engine.start('k', BLOCK, WORKSPACE),
      engine.start('k', BLOCK, WORKSPACE)
    ])
    expect([first, second]).toEqual([true, false])
    expect(await engine.start('another-block', BLOCK, WORKSPACE)).toBe(false)
    expect(fake.transport.create).toHaveBeenCalledTimes(1)
    expect(getNativeChatShellRun('another-block').phase).toBe('idle')
  })

  it('refuses to type into a Runs terminal that is running something else', async () => {
    const fake = fakeTransport({ busy: true })
    const { engine } = engineWith(fake)
    await engine.start('k', BLOCK, WORKSPACE)
    fake.emit('term_1', `${START}${end(0)}`)
    await vi.advanceTimersByTimeAsync(0)
    expect(await engine.start('k', BLOCK, WORKSPACE)).toBe(false)
    expect(getNativeChatShellRun('k')).toMatchObject({ phase: 'error', problem: 'terminal-busy' })
    expect(fake.transport.send).not.toHaveBeenCalled()
  })

  it('stops with an interrupt and reads the interrupted exit as stopped', async () => {
    const fake = fakeTransport()
    const { engine } = engineWith(fake)
    await engine.start('k', BLOCK, WORKSPACE)
    fake.emit('term_1', START)
    engine.stop('k')
    expect(fake.transport.interrupt).toHaveBeenCalledWith(WORKSPACE.target, 'term_1')
    expect(getNativeChatShellRun('k').phase).toBe('stopping')
    fake.emit('term_1', `^C${end(130)}`)
    await vi.advanceTimersByTimeAsync(0)
    expect(getNativeChatShellRun('k')).toMatchObject({ phase: 'stopped', exitCode: 130 })
  })

  it('does not claim a stop it never saw', async () => {
    const fake = fakeTransport()
    const { engine } = engineWith(fake)
    await engine.start('k', BLOCK, WORKSPACE)
    fake.emit('term_1', START)
    engine.stop('k')
    await vi.advanceTimersByTimeAsync(10_000)
    expect(getNativeChatShellRun('k')).toMatchObject({
      phase: 'unverifiable',
      problem: 'stop-unconfirmed',
      exitCode: null
    })
  })

  it('reads a stream that ends without its marker as unverifiable', async () => {
    const fake = fakeTransport()
    const { engine } = engineWith(fake)
    await engine.start('k', BLOCK, WORKSPACE)
    fake.emit('term_1', `${START}partial\r\n`)
    fake.close('term_1')
    await vi.advanceTimersByTimeAsync(0)
    expect(getNativeChatShellRun('k')).toMatchObject({
      phase: 'unverifiable',
      problem: 'lost-output',
      output: 'partial',
      exitCode: null
    })
  })

  it('flags a password prompt at once and a bare prompt once the run goes quiet', async () => {
    const fake = fakeTransport()
    const { engine } = engineWith(fake, [RUN_ID, 'run000000002'])
    await engine.start('k', BLOCK, WORKSPACE)
    fake.emit('term_1', `${START}Password: `)
    await vi.advanceTimersByTimeAsync(0)
    expect(getNativeChatShellRun('k').needsInput).toBe('secret')
    fake.emit('term_1', '\r\nok\r\n')
    await vi.advanceTimersByTimeAsync(0)
    expect(getNativeChatShellRun('k').needsInput).toBeNull()
    fake.emit('term_1', 'Name: ')
    await vi.advanceTimersByTimeAsync(500)
    expect(getNativeChatShellRun('k').needsInput).toBeNull()
    await vi.advanceTimersByTimeAsync(1_500)
    expect(getNativeChatShellRun('k').needsInput).toBe('prompt')
  })

  it('reports a start that never reached a terminal and frees the workspace', async () => {
    const fake = fakeTransport({ createFails: true })
    const { engine } = engineWith(fake)
    expect(await engine.start('k', BLOCK, WORKSPACE)).toBe(false)
    expect(getNativeChatShellRun('k')).toMatchObject({ phase: 'error', problem: 'start-failed' })
    expect(await engine.start('another', BLOCK, WORKSPACE)).toBe(false)
    expect(getNativeChatShellRun('another')).toMatchObject({ phase: 'error' })
  })

  it('keeps the last run across a reload, truncated, and never resumes one in flight', async () => {
    const fake = fakeTransport()
    const { engine } = engineWith(fake, [RUN_ID, 'run000000002'])
    await engine.start('done', BLOCK, WORKSPACE)
    const lines = Array.from({ length: 300 }, (_, index) => `line ${index}`).join('\r\n')
    fake.emit('term_1', `${START}${lines}\r\n${end(0)}`)
    await vi.advanceTimersByTimeAsync(0)
    await engine.start('inflight', BLOCK, WORKSPACE)
    fake.emit('term_1', `\u001b]777;orca-chat-run-start;run000000002\u0007working`)
    await vi.advanceTimersByTimeAsync(3_000)

    resetNativeChatShellRunStoreForTests()
    const restored = getNativeChatShellRun('done')
    expect(restored).toMatchObject({ phase: 'succeeded', exitCode: 0, truncated: true })
    expect(restored.output.split('\n')).toHaveLength(200)
    expect(restored.output.endsWith('line 299')).toBe(true)
    expect(getNativeChatShellRun('inflight')).toMatchObject({
      phase: 'unverifiable',
      problem: 'reloaded'
    })
  })

  it('focuses the Runs terminal on request', async () => {
    const fake = fakeTransport()
    const { engine } = engineWith(fake)
    expect(await engine.openTerminal({ kind: 'local' }, 'term_9')).toBe(true)
    expect(fake.transport.focus).toHaveBeenCalledWith({ kind: 'local' }, 'term_9')
    fake.transport.focus.mockRejectedValueOnce(new Error('terminal_handle_stale'))
    expect(await engine.openTerminal({ kind: 'local' }, 'term_9')).toBe(false)
  })
})
