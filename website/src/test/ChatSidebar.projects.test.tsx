/**
 * Chat sidebar — Projects.
 *
 *  (1) New > Project is in the create menu, asks for a name and a directory, makes
 *      the folder with `kind: 'project'`, then opens the project's first chat in it.
 *  (2) A project draws its workers nested under the conductor that opened them, and
 *      its own glyph; an ordinary folder keeps its flat rows.
 *
 * Radix DropdownMenu cannot be opened by mouse in jsdom (needs PointerEvent), so
 * the caret is activated by keyboard, as in ChatSidebar.createMenu.test.tsx.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router-dom'
import { createTestStore } from './helpers'
import { ThemeProvider } from '../hooks/useTheme'
import type { RootState } from '../store'
import type { ChatFolder } from '../types'

vi.mock('framer-motion', async () => {
  const React = await import('react')
  const FRAMER_PROPS = new Set([
    'layout', 'layoutId', 'layoutScroll', 'initial', 'animate', 'exit',
    'transition', 'variants', 'whileHover', 'whileTap', 'whileInView',
    'drag', 'dragConstraints', 'dragElastic', 'onAnimationComplete',
  ])
  const make = (tag: string) =>
    React.forwardRef((props: Record<string, unknown>, ref: React.Ref<unknown>) => {
      const clean: Record<string, unknown> = {}
      for (const k of Object.keys(props)) {
        if (k === 'children') continue
        if (k === 'layoutId') { clean['data-layout-id'] = props[k]; continue }
        if (FRAMER_PROPS.has(k)) continue
        clean[k] = props[k]
      }
      return React.createElement(tag, { ...clean, ref }, props.children as React.ReactNode)
    })
  const motion = new Proxy({}, { get: (_t, tag: string) => make(tag) })
  return {
    motion,
    AnimatePresence: ({ children }: { children?: React.ReactNode }) => React.createElement(React.Fragment, null, children),
    LayoutGroup: ({ children }: { children?: React.ReactNode }) => React.createElement(React.Fragment, null, children),
  }
})

vi.mock('../components/ProjectPicker', () => ({ default: () => null }))
vi.mock('../pages/chat/ChatSettings', () => ({
  loadChatConfig: () => ({ tagColumnsEnabled: false, confirmCloseSession: false }),
  saveChatConfig: vi.fn(),
}))

const mocks = vi.hoisted(() => ({
  createChatSlot: vi.fn(), createChatFolder: vi.fn(), chatFolders: vi.fn(), dashboardConfig: vi.fn(),
}))
vi.mock('../api/client', () => ({
  SEARCH_MIN_CHARS: 2,
  api: new Proxy(mocks as Record<string, unknown>, {
    get: (target, prop: string) => (prop in target ? target[prop] : vi.fn().mockResolvedValue([])),
  }),
}))

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((q: string) => ({
    matches: false, media: q, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(),
    addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  })),
})

import ChatSidebar from '../pages/ChatSidebar'

type TestSlot = Record<string, unknown>

const PROJECT: ChatFolder = { id: 'proj1', name: 'Ship', order: 0, kind: 'project' }
const PLAIN: ChatFolder = { id: 'plain1', name: 'Plain', order: 1 }

function renderSidebar(slots: TestSlot[] = [], folders: ChatFolder[] = []) {
  const store = createTestStore({
    dashboard: {
      status: {}, connected: true, slots, approvalMode: 'normal',
      channelTrusted: false, refreshTrigger: 0, unreadSlots: [], updateProgress: null,
      slotsLoaded: true,
      subagentRunning: {}, subagentDetails: {}, subagentText: {},
      sessionDefaultColor: null, sessionColorsMode: 'tint', sessionColorsPalette: 'horizon', sessionColorsIntensity: 'clear',
    } as unknown as RootState['dashboard'],
    chat: { activeSlot: null, slotStatusDetail: {}, subagents: {}, slotActivity: {} } as unknown as RootState['chat'],
  })
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  mocks.chatFolders.mockResolvedValue(folders)
  qc.setQueryData(['chat-folders'], folders)
  return render(
    <QueryClientProvider client={qc}>
      <Provider store={store}>
        <ThemeProvider>
          <MemoryRouter>
            <ChatSidebar
              slots={slots as never} activeSlot={null} unreadSlots={[]}
              history={[]} historyHasMore={false} defaultAgent="kirocrew" installedAgents={[]}
            />
          </MemoryRouter>
        </ThemeProvider>
      </Provider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('mc-session-stale-collapse-ms', '0')
  mocks.createChatSlot.mockResolvedValue({ key: 'chat-new-1' })
  mocks.createChatFolder.mockResolvedValue({ id: 'proj-new', name: 'Ship it', order: 0, kind: 'project' })
  mocks.dashboardConfig.mockResolvedValue({ default_memory_mode: 'persistent' })
})
afterEach(() => vi.clearAllMocks())

describe('New > Project', () => {
  it('creates a project folder and opens its first chat in it', async () => {
    renderSidebar()
    fireEvent.keyDown(screen.getByLabelText('More create options'), { key: 'Enter' })
    fireEvent.click(await screen.findByRole('menuitem', { name: 'New project' }))
    // The project form, not the folder form: it names the agent instead of a picker.
    await screen.findByTestId('folder-config-project-agent')
    fireEvent.change(screen.getByTestId('folder-config-name'), { target: { value: 'Ship it' } })
    fireEvent.change(screen.getByTestId('folder-config-project-dir'), { target: { value: '/work/ship' } })
    fireEvent.click(screen.getByTestId('folder-config-submit'))
    await waitFor(() => expect(mocks.createChatFolder).toHaveBeenCalledTimes(1))
    const [name, parentId, config] = mocks.createChatFolder.mock.calls[0]
    expect(name).toBe('Ship it')
    expect(parentId).toBeUndefined()
    expect(config).toMatchObject({ kind: 'project', project_dir: '/work/ship' })
    // The agent is the server's to bind (dashboard/project_folders.py); what the
    // sidebar owes is the first chat, filed in the new project.
    await waitFor(() => expect(mocks.createChatSlot).toHaveBeenCalledTimes(1))
    expect(mocks.createChatSlot.mock.calls[0][7]).toBe('proj-new')
  })

  it('an ordinary New folder sends no kind', async () => {
    mocks.createChatFolder.mockResolvedValue({ id: 'f-new', name: 'Plain', order: 0 })
    renderSidebar()
    fireEvent.keyDown(screen.getByLabelText('More create options'), { key: 'Enter' })
    fireEvent.click(await screen.findByRole('menuitem', { name: 'New folder' }))
    fireEvent.change(screen.getByTestId('folder-config-name'), { target: { value: 'Plain' } })
    fireEvent.click(screen.getByTestId('folder-config-submit'))
    await waitFor(() => expect(mocks.createChatFolder).toHaveBeenCalledTimes(1))
    expect(mocks.createChatFolder.mock.calls[0][2].kind).toBeUndefined()
    expect(mocks.createChatSlot).not.toHaveBeenCalled()
  })
})

const ROWS: TestSlot[] = [
  // Recency order puts a worker above its conductor; the project redraws by lineage.
  { key: 'k-worker', title: 'Worker', messages: 1, running: false, modified: 4000, folder_id: 'proj1', agent: 'kirocrew-worker', parent: { slot: 'k-cond', key: 'k-cond' } },
  { key: 'k-cond', title: 'Conductor', messages: 1, running: false, modified: 3000, folder_id: 'proj1', agent: 'kirocrew-conductor' },
  { key: 'k-pw', title: 'Plain worker', messages: 1, running: false, modified: 2000, folder_id: 'plain1', parent: { slot: 'k-pc', key: 'k-pc' } },
  { key: 'k-pc', title: 'Plain conductor', messages: 1, running: false, modified: 1000, folder_id: 'plain1' },
]

function rowKeysIn(folderId: string): string[] {
  const block = document.querySelector(`[data-folder-drop="${folderId}"]`)!
  return Array.from(block.querySelectorAll('[data-slot-key]')).map(el => el.getAttribute('data-slot-key') ?? '')
}

describe('a project in the folder tree', () => {
  it('nests each worker under its conductor; an ordinary folder stays flat', async () => {
    renderSidebar(ROWS, [PROJECT, PLAIN])
    await waitFor(() => expect(document.querySelector('[data-folder-drop="proj1"] [data-slot-key="k-cond"]')).not.toBeNull())
    expect(rowKeysIn('proj1')).toEqual(['k-cond', 'k-worker'])
    const worker = document.querySelector('[data-slot-key="k-worker"]')!.closest('[data-conductor-depth]')
    expect(worker?.getAttribute('data-conductor-depth')).toBe('1')
    expect(document.querySelector('[data-slot-key="k-cond"]')!.closest('[data-conductor-depth]')).toBeNull()
    expect(rowKeysIn('plain1')).toEqual(['k-pw', 'k-pc'])
    expect(document.querySelector('[data-slot-key="k-pw"]')!.closest('[data-conductor-depth]')).toBeNull()
  })

  it('draws the project with its own glyph', async () => {
    renderSidebar(ROWS, [PROJECT, PLAIN])
    const projectGlyph = await screen.findByTestId('folder-collapse-proj1-shape')
    const plainGlyph = screen.getByTestId('folder-collapse-plain1-shape')
    expect(projectGlyph.getAttribute('class')).toContain('lucide-folder-kanban')
    expect(plainGlyph.getAttribute('class')).not.toContain('lucide-folder-kanban')
  })
})
