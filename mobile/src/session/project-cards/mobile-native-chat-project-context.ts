import { createContext } from 'react'
import type { NativeChatMessage } from '../../../../src/shared/native-chat-types'
import type { MobileNativeChatProject } from './mobile-native-chat-project'

export type MobileNativeChatProjects = {
  resolve: (target: string) => MobileNativeChatProject | null
  open: (project: MobileNativeChatProject) => void
  messages: readonly NativeChatMessage[]
  /** Sends the text as the user's next message; false when it did not go. */
  send: (text: string) => Promise<boolean>
  canSend: boolean
}

/** Null outside native chat, where chips read as their link text and cards as code. */
export const MobileNativeChatProjectsContext = createContext<MobileNativeChatProjects | null>(null)

/** The reply a card sits in; a card keys its free-text record by it. */
export const MobileNativeChatMessageIdContext = createContext<string | undefined>(undefined)

/** Only a transcript that names a project pays for the catalog reads. */
export function mobileNativeChatMentionsProject(messages: readonly NativeChatMessage[]): boolean {
  return messages.some(
    (message) =>
      message.role === 'assistant' &&
      message.blocks.some(
        (block) =>
          block.type === 'text' &&
          (block.text.includes('```project-card') || block.text.includes('orca-worktree:'))
      )
  )
}
