/**
 * A refused session create from the collapsed sidebar's flyout New, and from the
 * empty pane's Start a new chat, reports through the page's ErrorNotice surfaces
 * instead of doing nothing. A create the Crew Mode default points at the
 * Conductor can be refused where an agent-less one would not be, so neither
 * gesture may swallow the rejection.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, act, screen, fireEvent, waitFor } from '@testing-library/react'
import type { UseMutationResult } from '@tanstack/react-query'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Provider } from 'react-redux'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { createConnectedTestStore } from './helpers'
import type { ChatSlot } from '../types'
import { ThemeProvider } from '../hooks/useTheme'
import { __resetPanelTabs } from '../hooks/usePanelTabs'
import { sseSlots } from '../store/dashboardSlice'

vi.mock('react-virtuoso', () => ({ Virtuoso: () => null }))
vi.mock('../components/ChatInput', () => ({ default: () => null }))
vi.mock('../components/WelcomeView', () => ({ default: () => null }))
vi.mock('../components/MarkdownPanel', () => ({ default: () => null }))
vi.mock('../components/MarkdownRenderer', () => ({ default: () => null }))
vi.mock('../components/TypewriterText', () => ({ default: () => null }))
vi.mock('../components/AgentDropdownList', () => ({ default: () => null }))
vi.mock('../components/ModelDropdownList', () => ({ default: () => null }))
vi.mock('../components/InfoTip', () => ({ default: () => null }))
vi.mock('../components/SegmentedControl', () => ({ default: () => null }))
vi.mock('../pages/chat/CollapsibleToolGroup', () => ({ default: () => null }))
vi.mock('../pages/chat/ActivityViewer', () => ({ default: () => null }))
vi.mock('../pages/chat/SessionColorPicker', () => ({ default: () => null }))
vi.mock('../pages/chat', () => ({ ChatFooter: () => null, AssistantMessage: () => null, McpInfoButton: () => null }))
vi.mock('../pages/ChatSidebar', () => ({ default: () => null, SIDEBAR_MIN: 200, SIDEBAR_MAX: 500 }))
vi.mock('../pages/chat/SidePanel', () => ({
  default: () => null,
  SIDE_PANEL_MIN_W: 320,
  SIDE_PANEL_RESERVED_W: 560,
  CHAT_PANE_MIN_W: 320,
  sidePanelFillWidth: () => undefined,
}))
vi.mock('../hooks/useBranding', () => ({ useBranding: () => ({ botName: 'Test', avatar: '' }) }))
vi.mock('../hooks/useAgents', () => ({ useAgents: () => ({ agents: [], defaultAgent: null }) }))
vi.mock('../hooks/useVoiceInput', () => ({ useVoiceInput: () => ({ recording: false, transcribing: false, toggle: vi.fn() }), voiceInputSupported: false }))
vi.mock('../hooks/useIsMobile', () => ({ useIsMobile: () => false }))
const createChatSlot = vi.hoisted(() => vi.fn())
vi.mock('../api/client', () => ({
  api: {
    ...Object.fromEntries(
      ['sessions', 'chatSlotDetail', 'deleteChatSlot', 'resumeChatSlot', 'deleteSession', 'agentDetail',
        'approveChatSlot', 'chatSlotAgent', 'chatSlotModel', 'chatSlotWorkspace', 'models', 'renameSlot',
        'resolveApproval', 'slackChannels', 'spawnList', 'stopChatSlot', 'uploadFiles', 'workspaces',
        'chatSlots', 'notifications', 'status', 'generateTitle', 'dashboardConfig'].map(k => [k, vi.fn().mockResolvedValue(
        k === 'chatSlotDetail' ? { messages: [], has_more: false, total: 0 } : {},
      )]),
    ),
    createChatSlot,
  },
}))

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((q: string) => ({
    matches: false, media: q, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(),
    addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  })),
})
globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) }) as unknown as typeof fetch
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver

import ChatPage from '../pages/ChatPage'
import ChatEmptyState from '../pages/chat/page/ChatEmptyState'

beforeEach(() => {
  localStorage.clear()
  __resetPanelTabs()
  createChatSlot.mockReset()
  createChatSlot.mockRejectedValue(new Error('gateway unavailable'))
})

describe('a refused new-chat create', () => {
  it('from the collapsed sidebar flyout, shows the page notice', async () => {
    const store = createConnectedTestStore()
    act(() => {
      store.dispatch(sseSlots([{ key: 'slot-0', title: 'Session 0' } as unknown as ChatSlot]))
    })
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <Provider store={store}>
          <ThemeProvider>
            <MemoryRouter initialEntries={['/chat']}>
              <Routes><Route path="/chat/:slug?" element={<ChatPage />} /></Routes>
            </MemoryRouter>
          </ThemeProvider>
        </Provider>
      </QueryClientProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Hide sessions sidebar' }))
    fireEvent.keyDown(screen.getByRole('button', { name: 'Show sessions sidebar' }), { key: 'ArrowDown' })
    fireEvent.click(await screen.findByRole('menuitem', { name: 'New chat' }))

    await waitFor(() => expect(createChatSlot).toHaveBeenCalledTimes(1))
    const notice = await screen.findByTestId('action-error')
    expect(notice).toHaveTextContent('Could not start a new session')
    expect(notice).toHaveTextContent('gateway unavailable')
  })

  it('from the empty pane, shows the session notice and leaves the button a plain create', async () => {
    const store = createConnectedTestStore()
    const setSidError = vi.fn()
    const setNewSlotFailed = vi.fn()
    const newSlotMutation = { isPending: false, mutate: vi.fn() } as unknown as UseMutationResult<ChatSlot, Error, void, unknown>
    render(
      <ChatEmptyState
        mode={undefined} dispatch={store.dispatch} pendingAgent="" pendingAgentKindRef={{ current: undefined }} pendingModel=""
        newSessionRef={{ current: false }} newSlotFailed={false} newSlotMutation={newSlotMutation}
        setNewSlotFailed={setNewSlotFailed} setSidError={setSidError}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Start a new chat' }))

    await waitFor(() => expect(setSidError).toHaveBeenCalledWith('Could not start a new session'))
    expect(createChatSlot).toHaveBeenCalledTimes(1)
    // A plain create: the retry path (`?new=1`'s mutation) is not armed by it.
    expect(setNewSlotFailed).not.toHaveBeenCalled()
    expect(newSlotMutation.mutate).not.toHaveBeenCalled()
  })
})
