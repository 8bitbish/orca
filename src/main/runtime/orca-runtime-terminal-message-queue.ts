import { OrcaRuntimeWithResolveWaiter } from './orca-runtime-resolve-waiter'
import {
  TerminalMessageQueueHost,
  type ResolvedTerminalMessageQueueTarget,
  type TerminalMessageQueueStatusSource,
  type TerminalMessageQueueTargetRef
} from '../terminal-message-queue/terminal-message-queue-host'
import {
  deliverQueuedMessage,
  QUEUE_INTERRUPT_KEY
} from '../terminal-message-queue/terminal-message-queue-delivery'
import { sendAgentTurn } from './orchestration/send-agent-turn'
import { watchTranscriptForInterrupts } from '../terminal-message-queue/terminal-message-queue-transcript-watch'
import type { TerminalQueuedMessage } from '../../shared/terminal-message-queue-contract'
import type { PtyIncarnationId } from '../../shared/pty-incarnation'
import type { TerminalExitCause } from '../../shared/terminal-exit-cause'

/** Hosts the per-terminal message queue next to the PTYs it writes to. */
export class OrcaRuntimeWithTerminalMessageQueue extends OrcaRuntimeWithResolveWaiter {
  readonly terminalMessageQueue = new TerminalMessageQueueHost(
    {
      resolveTarget: (ref) => this.resolveTerminalMessageQueueTarget(ref),
      paneKeyForPty: (ptyId) => this.ptysById.get(ptyId)?.paneKey ?? null,
      deliver: (target, item, agent) => this.deliverQueuedTerminalMessage(target, item, agent),
      interrupt: async (target) => {
        try {
          await this.sendTerminal(
            target.handle,
            { text: QUEUE_INTERRUPT_KEY },
            { inputKind: 'driving' }
          )
          return true
        } catch {
          return false
        }
      }
    },
    watchTranscriptForInterrupts
  )

  /** Startup wires the host's agent-status store in; until then every lead reads `unknown`. */
  attachTerminalMessageQueueStatusSource(source: TerminalMessageQueueStatusSource): void {
    this.terminalMessageQueue.attachStatusSource(source)
  }

  override onPtyExit(
    ptyId: string,
    exitCode: number,
    exitIncarnationId?: PtyIncarnationId,
    options: {
      hostExitConfirmed?: boolean
      cause?: TerminalExitCause
      providerExitObserved?: boolean
    } = {}
  ): void | Promise<void> {
    const pty = this.ptysById.get(ptyId)
    const staleIncarnation =
      exitIncarnationId !== undefined &&
      pty?.incarnationId !== undefined &&
      pty.incarnationId !== null &&
      exitIncarnationId !== pty.incarnationId
    if (!staleIncarnation) {
      // Why: an SSH exit the host did not confirm is a lost view of the PTY, not its death.
      const unconfirmedSsh =
        this.isSshOwnedPtyId(ptyId) && exitCode < 0 && options.hostExitConfirmed !== true
      this.terminalMessageQueue.onPtyExit(ptyId, unconfirmedSsh ? 'unverifiable' : 'exited')
    }
    return super.onPtyExit(ptyId, exitCode, exitIncarnationId, options)
  }

  private resolveTerminalMessageQueueTarget(
    ref: TerminalMessageQueueTargetRef
  ): ResolvedTerminalMessageQueueTarget | null {
    if (ref.terminal) {
      const ptyId =
        this.getLivePtyForHandle(ref.terminal)?.pty.ptyId ?? this.handles.get(ref.terminal)?.ptyId
      return ptyId ? { ptyId, handle: ref.terminal } : null
    }
    const ptyId = ref.ptyId
    const pty = ptyId ? this.ptysById.get(ptyId) : undefined
    if (!ptyId || !pty) {
      return null
    }
    return { ptyId, handle: this.issuePtyHandle(pty) }
  }

  private deliverQueuedTerminalMessage(
    target: ResolvedTerminalMessageQueueTarget,
    item: TerminalQueuedMessage,
    sessionAgent: string | null
  ): ReturnType<typeof deliverQueuedMessage> {
    const pty = this.ptysById.get(target.ptyId)
    const agent = sessionAgent ?? pty?.foregroundAgent ?? pty?.launchAgent ?? null
    const write = async (action: { text?: string; enter?: boolean }): Promise<void> => {
      await this.sendTerminal(target.handle, action, { inputKind: 'driving' })
    }
    return deliverQueuedMessage(
      {
        writeRaw: (bytes) => write({ text: bytes }),
        sendPrompt: async (text) => {
          await sendAgentTurn({
            kind: 'terminal',
            runtime: this,
            handle: target.handle,
            turn: { purpose: 'queued-message', body: text, operationId: item.id }
          })
        },
        submit: () => write({ enter: true }),
        sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms))
      },
      item,
      agent
    )
  }
}
