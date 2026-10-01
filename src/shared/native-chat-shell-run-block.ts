// Which chat code fences get a Run button, and what running one means: the script
// itself (console prompts stripped), the shell that runs it, and the workspace a
// `# workspace: <repo/workspace>` first line points it at.

export type NativeChatShellRunInterpreter = 'bash' | 'zsh' | 'sh' | 'auto'

export type NativeChatShellRunBlock = {
  script: string
  interpreter: NativeChatShellRunInterpreter
  /** The `# workspace:` target as written, or null to run in the chat's own workspace. */
  workspaceTarget: string | null
}

/** Longer blocks are not something to run from a chat message in one click. */
export const NATIVE_CHAT_SHELL_RUN_MAX_SCRIPT_CHARS = 32 * 1024

const LANGUAGE_INTERPRETERS: Record<string, NativeChatShellRunInterpreter> = {
  bash: 'bash',
  zsh: 'zsh',
  sh: 'sh',
  shell: 'auto',
  console: 'auto'
}

const WORKSPACE_LINE = /^[ \t]*#[ \t]*workspace:[ \t]*(\S(?:.*\S)?)[ \t]*$/i
const PROMPT_LINE = /^[ \t]*\$ ?/
// First words of lines that read as commands rather than prose, config or code.
const COMMAND_WORDS = new Set(
  (
    'ls cd pwd git npm pnpm yarn npx bun bunx node deno python python3 pip pip3 uv brew make ' +
    'cargo go docker kubectl echo cat mkdir rm cp mv touch grep rg find curl wget ssh scp rsync ' +
    'chmod chown export source sudo open code orca gh glab tar unzip zip which head tail less ' +
    'sed awk xargs env pytest bundle gem rake rails swift xcodebuild xcrun pod flutter dart ' +
    'gradle ./gradlew mvn java kill ps df du ln tree jq sort uniq wc diff tmux defaults ' +
    'launchctl security say date whoami uname printf test ruby perl php lsof killall pkill ' +
    'pbcopy pbpaste mise asdf nvm corepack tsc vitest jest eslint oxlint prettier'
  ).split(' ')
)

function stripConsolePrompts(code: string): string | null {
  const lines = code.split('\n')
  if (!lines.some((line) => PROMPT_LINE.test(line))) {
    return null
  }
  const kept: string[] = []
  let continuing = false
  for (const line of lines) {
    if (PROMPT_LINE.test(line)) {
      kept.push(line.replace(PROMPT_LINE, ''))
    } else if (continuing) {
      kept.push(line)
    } else {
      continue
    }
    continuing = line.trimEnd().endsWith('\\')
  }
  return kept.join('\n')
}

function commandLines(code: string): string[] {
  return code
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'))
}

/** An unlabelled fence runs only when every line opens with a known command. */
export function looksLikeShellCommands(code: string): boolean {
  const lines = commandLines(stripConsolePrompts(code) ?? code)
  if (lines.length === 0 || lines.length > 30) {
    return false
  }
  return lines.every((line) => {
    const first = line.split(/\s+/)[0].replace(/^(sudo|env)$/, '')
    const word = first === '' ? (line.split(/\s+/)[1] ?? '') : first
    return COMMAND_WORDS.has(word) || /^\.{0,2}\/[\w.-]/.test(word)
  })
}

export function parseNativeChatShellRunWorkspaceTarget(script: string): string | null {
  const firstLine = script.split('\n', 1)[0] ?? ''
  return WORKSPACE_LINE.exec(firstLine)?.[1] ?? null
}

/** The runnable form of a fence, or null when it gets no Run button. */
export function nativeChatShellRunBlock(
  language: string | undefined,
  code: string
): NativeChatShellRunBlock | null {
  const normalized = language?.trim().toLowerCase() ?? ''
  const interpreter = normalized === '' ? 'auto' : LANGUAGE_INTERPRETERS[normalized]
  if (!interpreter) {
    return null
  }
  if (normalized === '' && !looksLikeShellCommands(code)) {
    return null
  }
  const body = code.replace(/\r\n?/g, '\n').replace(/\n+$/, '')
  const workspaceTarget = parseNativeChatShellRunWorkspaceTarget(body)
  const prompted = normalized === 'console' || normalized === '' ? stripConsolePrompts(body) : null
  const script = prompted === null ? body : prompted
  if (commandLines(script).length === 0 || script.length > NATIVE_CHAT_SHELL_RUN_MAX_SCRIPT_CHARS) {
    return null
  }
  return { script, interpreter, workspaceTarget }
}
