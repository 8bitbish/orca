// Desktop's project targets: the shared resolver over the store's repo and worktree rows.

import type { Repo } from '../../../../shared/repo-types'
import type { Worktree } from '../../../../shared/worktree/types'
import type { NativeChatProjectTarget as SharedNativeChatProjectTarget } from '../../../../shared/native-chat-project-target'

export {
  NATIVE_CHAT_WORKTREE_LINK_SCHEME,
  nativeChatProjectWorkspaceLabel,
  parseNativeChatWorktreeHref,
  resolveNativeChatProjectTarget
} from '../../../../shared/native-chat-project-target'

export type NativeChatProjectTarget = SharedNativeChatProjectTarget<Repo, Worktree>
