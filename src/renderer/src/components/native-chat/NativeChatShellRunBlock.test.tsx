// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NativeChatMessage } from '../../../../shared/native-chat-types'
import type { Repo } from '../../../../shared/repo-types'
import { useAppStore } from '@/store'
import { makeWorktree } from '../../store/slices/store-test-helpers'
import { MessageRow } from './NativeChatMessageRow'
import { NativeChatShellRunConfirmDialog } from './NativeChatShellRunConfirmDialog'
import {
  NativeChatShellRunContext,
  type NativeChatShellRunScope
} from './native-chat-shell-run-workspace'
import { resetNativeChatShellRunStoreForTests } from './native-chat-shell-run-store'
import { assessNativeChatShellRunRisks } from '../../../../shared/native-chat-shell-run-risk'

const start = vi.hoisted(() => vi.fn(async () => true))
vi.mock('./native-chat-shell-runs', () => ({
  nativeChatShellRuns: { start, stop: vi.fn(), openTerminal: vi.fn(async () => true) }
}))
vi.mock('./use-native-chat-project-live-status', () => ({
  useNativeChatProjectLiveStatus: () => ({ status: 'idle', liveLine: null })
}))

const repo: Repo = {
  id: 'repo-orca',
  path: '/code/orca',
  displayName: 'orca',
  badgeColor: '#737373',
  addedAt: 0
}
const main = makeWorktree({
  id: 'repo-orca::/code/orca',
  repoId: repo.id,
  path: '/code/orca',
  displayName: 'orca',
  isMainWorktree: true
})
const feature = makeWorktree({
  id: 'repo-orca::/code/ws/feature-x',
  repoId: repo.id,
  path: '/code/ws/feature-x',
  displayName: 'feature-x'
})
const SCOPE: NativeChatShellRunScope = { worktreeId: main.id, sessionId: 'session-1' }

function message(
  role: NativeChatMessage['role'],
  text: string,
  extra: NativeChatMessage['blocks'] = []
): NativeChatMessage {
  return {
    id: `m-${role}`,
    role,
    timestamp: 0,
    source: 'transcript',
    blocks: [{ type: 'text', text }, ...extra]
  }
}

function renderRow(row: NativeChatMessage, scope: NativeChatShellRunScope | null = SCOPE) {
  const node = <MessageRow message={row} expandSignal={false} onScrollMessageToTop={vi.fn()} />
  return render(
    scope ? (
      <NativeChatShellRunContext.Provider value={scope}>{node}</NativeChatShellRunContext.Provider>
    ) : (
      node
    )
  )
}

const runButton = () => screen.queryByRole('button', { name: 'Run' })

beforeEach(() => {
  localStorage.clear()
  resetNativeChatShellRunStoreForTests()
  useAppStore.setState({ repos: [repo], worktreesByRepo: { [repo.id]: [main, feature] } })
})

afterEach(() => {
  cleanup()
  start.mockClear()
})

describe('shell Run button eligibility', () => {
  it('appears on a closed shell fence in the agent’s reply', () => {
    renderRow(message('assistant', 'Try:\n\n```bash\nls -la\n```'))
    expect(runButton()).toBeEnabled()
    expect(screen.getByText('ls -la')).toBeInTheDocument()
  })

  it('appears on a clearly-command unlabelled fence and not on prose in one', () => {
    renderRow(message('assistant', '```\ngit status\n```\n\n```\nThis is just a note.\n```'))
    expect(screen.getAllByRole('button', { name: 'Run' })).toHaveLength(1)
  })

  it('never appears in the user’s own message, even for a pasted shell block', () => {
    renderRow(message('user', 'I ran this:\n\n```bash\nrm -rf build\n```'))
    expect(runButton()).toBeNull()
    expect(screen.getByText('rm -rf build')).toBeInTheDocument()
  })

  it('never appears in reasoning, system rows or tool output', () => {
    renderRow(message('reasoning', '```bash\nls\n```'))
    expect(runButton()).toBeNull()
    cleanup()
    renderRow(message('system', '```bash\nls\n```'))
    expect(runButton()).toBeNull()
    cleanup()
    renderRow(
      message('assistant', 'Done.', [
        { type: 'tool-call', name: 'Bash', input: { command: 'ls' } },
        { type: 'tool-result', output: '```bash\nls\n```' }
      ])
    )
    expect(runButton()).toBeNull()
  })

  it('stays off while the fence is still streaming', () => {
    renderRow(message('assistant', 'Run:\n\n```bash\nls -la'))
    expect(runButton()).toBeNull()
  })

  it('stays off outside a chat that can run it', () => {
    renderRow(message('assistant', '```bash\nls\n```'), null)
    expect(runButton()).toBeNull()
  })

  it('shows another workspace as a project chip and runs there', () => {
    renderRow(message('assistant', '```bash\n# workspace: orca/feature-x\npnpm test\n```'))
    expect(screen.getByText('feature-x')).toBeInTheDocument()
    expect(runButton()).toBeEnabled()
  })

  it('disables an unknown workspace target and says why', () => {
    renderRow(message('assistant', '```bash\n# workspace: nowhere/else\nls\n```'))
    expect(runButton()).toBeDisabled()
    expect(screen.getByText('Orca doesn’t know the workspace “nowhere/else”.')).toBeInTheDocument()
  })

  it('does not start a run from a synthetic click', () => {
    renderRow(message('assistant', '```bash\nls\n```'))
    const button = runButton()
    expect(button).not.toBeNull()
    fireEvent.click(button!)
    expect(start).not.toHaveBeenCalled()
  })
})

describe('shell Run status after a reload', () => {
  it('shows the last run’s result and output from local storage', () => {
    localStorage.setItem(
      'orca:nativeChatShellRuns:v1',
      JSON.stringify({
        'session-1:m-assistant:0': {
          phase: 'failed',
          runId: 'run000000001',
          startedAt: 1_000,
          endedAt: 3_500,
          exitCode: 2,
          needsInput: null,
          output: 'ls: nope: No such file or directory',
          truncated: false,
          problem: null,
          terminalHandle: 'term_1',
          worktreeId: main.id,
          updatedAt: 4_000
        }
      })
    )
    renderRow(message('assistant', '```bash\nls nope\n```'))
    expect(screen.getByText('ls: nope: No such file or directory')).toBeInTheDocument()
    expect(screen.getByText('Exit 2 · 2.5s')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Run again' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Open in terminal' })).toBeInTheDocument()
  })
})

describe('NativeChatShellRunConfirmDialog', () => {
  it('names each risk with the command that raised it and shows the whole script', () => {
    const script = 'git push --force\nrm -rf build'
    render(
      <NativeChatShellRunConfirmDialog
        risks={assessNativeChatShellRunRisks(script)}
        script={script}
        workspaceLabel={null}
        onRun={vi.fn()}
        onCancel={vi.fn()}
      />
    )
    expect(screen.getByText('Run this command?')).toBeInTheDocument()
    expect(screen.getByText('Deletes files')).toBeInTheDocument()
    expect(screen.getByText('Rewrites git history')).toBeInTheDocument()
    expect(screen.getByText('rm -rf build', { selector: 'code' })).toBeInTheDocument()
    expect(
      screen.getByText(/git push --force\s+rm -rf build/, { selector: 'pre' })
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
  })
})
