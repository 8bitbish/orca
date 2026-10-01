import { describe, expect, it } from 'vitest'
import {
  NATIVE_CHAT_SHELL_RUN_MAX_SCRIPT_CHARS,
  looksLikeShellCommands,
  nativeChatShellRunBlock,
  parseNativeChatShellRunWorkspaceTarget
} from './native-chat-shell-run-block'

describe('nativeChatShellRunBlock', () => {
  it.each([
    ['bash', 'bash'],
    ['sh', 'sh'],
    ['zsh', 'zsh'],
    ['shell', 'auto'],
    ['console', 'auto'],
    ['BASH', 'bash']
  ])('runs a %s fence with %s', (language, interpreter) => {
    expect(nativeChatShellRunBlock(language, 'ls -la\n')).toEqual({
      script: 'ls -la',
      interpreter,
      workspaceTarget: null
    })
  })

  it.each([
    'ts',
    'python',
    'json',
    'diff',
    'text',
    'mermaid',
    'html',
    'project-card',
    'powershell'
  ])('gives a %s fence no Run button', (language) => {
    expect(nativeChatShellRunBlock(language, 'ls\n')).toBeNull()
  })

  it('runs an unlabelled fence only when every line is clearly a command', () => {
    expect(nativeChatShellRunBlock(undefined, 'git status\npnpm test\n')?.interpreter).toBe('auto')
    expect(nativeChatShellRunBlock(undefined, 'cd app && ./gradlew build')).not.toBeNull()
    expect(nativeChatShellRunBlock(undefined, 'The build failed because of x.')).toBeNull()
    expect(nativeChatShellRunBlock(undefined, 'const x = 1\nconsole.log(x)')).toBeNull()
    expect(nativeChatShellRunBlock(undefined, '{ "name": "orca" }')).toBeNull()
    expect(nativeChatShellRunBlock(undefined, 'git status\nthen check the output')).toBeNull()
  })

  it('strips console prompts and drops the output lines they show', () => {
    const block = nativeChatShellRunBlock(
      'console',
      '$ git status\nOn branch main\n$ pnpm test \\\n  --run\n 3 passed\n'
    )
    expect(block?.script).toBe('git status\npnpm test \\\n  --run')
  })

  it('keeps a console block without prompts as written', () => {
    expect(nativeChatShellRunBlock('console', 'ls\npwd')?.script).toBe('ls\npwd')
  })

  it('reads a # workspace: first line as the target and keeps it in the script', () => {
    const block = nativeChatShellRunBlock('bash', '# workspace: orca/feature-x\npnpm test\n')
    expect(block).toEqual({
      script: '# workspace: orca/feature-x\npnpm test',
      interpreter: 'bash',
      workspaceTarget: 'orca/feature-x'
    })
  })

  it('gives a block with nothing to run no button', () => {
    expect(nativeChatShellRunBlock('bash', '# just a comment\n\n')).toBeNull()
    expect(nativeChatShellRunBlock('bash', '')).toBeNull()
  })

  it('refuses a block too long to run from chat', () => {
    expect(
      nativeChatShellRunBlock('bash', `echo ${'x'.repeat(NATIVE_CHAT_SHELL_RUN_MAX_SCRIPT_CHARS)}`)
    ).toBeNull()
  })
})

describe('parseNativeChatShellRunWorkspaceTarget', () => {
  it.each([
    ['# workspace: orca', 'orca'],
    ['#workspace:orca/main', 'orca/main'],
    ['  # Workspace:   my repo/feature/x  ', 'my repo/feature/x'],
    ['# workspace: repo::/path/to/wt', 'repo::/path/to/wt']
  ])('reads %j', (line, target) => {
    expect(parseNativeChatShellRunWorkspaceTarget(`${line}\nls`)).toBe(target)
  })

  it.each([
    'ls\n# workspace: orca',
    '# workspace:',
    '# workspaces: orca',
    'echo # workspace: orca'
  ])('ignores %j', (script) => {
    expect(parseNativeChatShellRunWorkspaceTarget(script)).toBeNull()
  })
})

describe('looksLikeShellCommands', () => {
  it('accepts prompts, sudo and relative scripts', () => {
    expect(looksLikeShellCommands('$ ls\n$ ./scripts/setup.sh')).toBe(true)
    expect(looksLikeShellCommands('sudo brew upgrade')).toBe(true)
  })

  it('rejects empty and very long blocks', () => {
    expect(looksLikeShellCommands('# only a comment')).toBe(false)
    expect(looksLikeShellCommands(Array.from({ length: 31 }, () => 'ls').join('\n'))).toBe(false)
  })
})
