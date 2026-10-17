import type { UseMutationResult } from '@tanstack/react-query'
import type { MutableRefObject, Dispatch, SetStateAction } from 'react'
import { MessageSquare } from 'lucide-react'
import type { AppDispatch } from '../../../store'
import type { ChatSlot } from '../../../types'
import { createSlot } from '../../../store/chatSlice'
import { newChatAgent } from '../../../lib/crewMode'
import { EmptyState, Btn } from '../../../components/ui'
import { i18nT } from '../../../i18n/t'
import { uiLocation } from '../../../uiLocations/uiLocation'

interface ChatEmptyStateProps {
  mode?: string
  dispatch: AppDispatch
  pendingAgent: string
  pendingAgentKindRef: MutableRefObject<'member' | 'template' | undefined>
  pendingModel: string
  newSessionRef: MutableRefObject<boolean>
  newSlotFailed: boolean
  newSlotMutation: UseMutationResult<ChatSlot, Error, void, unknown>
  setNewSlotFailed: Dispatch<SetStateAction<boolean>>
  setSidError: Dispatch<SetStateAction<string>>
}

/**
 * The pane with no session open: the empty state and its Start a new chat button (which retries a failed create).
 */
export default function ChatEmptyState({
  mode, dispatch, pendingAgent, pendingAgentKindRef, pendingModel, newSessionRef, newSlotFailed, newSlotMutation, setNewSlotFailed, setSidError,
}: ChatEmptyStateProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8">
      <EmptyState icon={<MessageSquare className="lucide-inline" />} title={i18nT('pages.chatPage.what_can_i_do_for_you')} subtitle={i18nT('pages.chatPage.start_a_new_chat_to_begin')} />
      <Btn
        primary
        disabled={newSlotMutation.isPending}
        {...uiLocation('chat.start-new-chat')}
        onClick={() => {
          if (newSlotFailed) {
            // Re-arm before state updates can let auto-selection run.
            newSessionRef.current = true
            setNewSlotFailed(false)
            setSidError('')
            newSlotMutation.mutate()
            return
          }
          // A refused create reports through the pane's session notice, worded as
          // the `?new=1` create's failure is; the button stays a plain create, so
          // pressing it again retries the same request.
          dispatch(createSlot({ ...(pendingAgent ? { agent: pendingAgent, agent_kind: pendingAgentKindRef.current } : mode ? {} : newChatAgent()), model: pendingModel || undefined, mode }))
            .unwrap()
            .catch(() => setSidError(i18nT('pages.chatPage.could_not_start_a_new_session')))
        }}
      >
        {i18nT('pages.chatPage.start_a_new_chat')}
      </Btn>
    </div>
  )
}
