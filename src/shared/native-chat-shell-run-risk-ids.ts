// What the chat Run button asks about before it runs a block, in the order its
// confirmation lists them.

export const NATIVE_CHAT_SHELL_RUN_RISK_IDS = [
  'sudo',
  'delete',
  'git-push',
  'git-rewrite',
  'git-discard',
  'force',
  'install',
  'package-run',
  'docker',
  'keychain',
  'network-send',
  'remote-shell',
  'publish',
  'cloud',
  'eval',
  'exec',
  'source',
  'dynamic-command',
  'decode-pipe',
  'inline-code',
  'pipe-to-shell',
  'stdin-code',
  'alias-function',
  'overwrite',
  'append',
  'move',
  'permissions',
  'kill',
  'services',
  'defaults',
  'osascript',
  'disk',
  'system',
  'unreadable'
] as const

export type NativeChatShellRunRiskId = (typeof NATIVE_CHAT_SHELL_RUN_RISK_IDS)[number]
