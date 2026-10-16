import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import type { ChatFolder } from '../types'
import { projectRootId } from '../utils/folderAgent'

/** Whether a chat filed in `folderId` sits in a Project, whose agent is locked to
 *  the conductor server-side (`project_agent_locked`). A surface that would offer
 *  an agent picker hides it when this is true.
 *
 *  Reads the shared `['chat-folders']` cache the sidebar fills, so it costs no
 *  request of its own. The call is guarded the way `sessionControls` guards it: a
 *  partially mocked `api` must not take the pane down over a picker decision. */
export function useProjectAgentLocked(folderId: string | null | undefined): boolean {
  const { data } = useQuery<ChatFolder[]>({
    queryKey: ['chat-folders'],
    queryFn: () =>
      typeof api?.chatFolders === 'function' ? api.chatFolders() : Promise.resolve([]),
  })
  return Array.isArray(data) && !!projectRootId(data, folderId)
}
