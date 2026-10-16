import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, renderHook, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import FolderConfigModal from '../components/FolderConfigModal'
import { useProjectAgentLocked } from '../hooks/useProjectAgentLocked'
import { ChatFolder } from '../types'
import { PROJECT_AGENT, projectRootId, resolveFolderAgent } from '../utils/folderAgent'
import { projectLineageRows } from '../pages/chat-sidebar/projectLineage'
import type { Slot } from '../pages/chat-sidebar/types'

vi.mock('../api/client', () => ({
  api: {
    recentProjects: vi.fn().mockResolvedValue({ dirs: [] }),
    favoriteProjects: vi.fn().mockResolvedValue({ dirs: [] }),
    browseDirs: vi.fn().mockResolvedValue({ path: '/', parent: '', dirs: [] }),
  },
}))

const folder = (id: string, extra: Partial<ChatFolder> = {}): ChatFolder =>
  ({ id, name: id, order: 0, ...extra }) as ChatFolder

const TREE: ChatFolder[] = [
  folder('p', { name: 'Ship', kind: 'project', default_agent: 'kirocrew-dev' }),
  folder('p-sub', { parent_id: 'p' }),
  folder('plain', { default_agent: 'kirocrew-dev' }),
  // A damaged cycle must end the walk rather than spin.
  folder('x', { parent_id: 'y' }),
  folder('y', { parent_id: 'x' }),
]

describe('project folder resolution', () => {
  it('finds the project a folder sits in, through ancestors', () => {
    expect(projectRootId(TREE, 'p')).toBe('p')
    expect(projectRootId(TREE, 'p-sub')).toBe('p')
    expect(projectRootId(TREE, 'plain')).toBeUndefined()
    expect(projectRootId(TREE, 'x')).toBeUndefined()
    expect(projectRootId(TREE, undefined)).toBeUndefined()
  })

  it('names the conductor for a new chat anywhere in a project, ignoring default_agent', () => {
    expect(resolveFolderAgent(TREE, 'p', 'kirocrew')).toBe(PROJECT_AGENT)
    expect(resolveFolderAgent(TREE, 'p-sub', 'kirocrew')).toBe(PROJECT_AGENT)
    expect(resolveFolderAgent(TREE, 'plain', 'kirocrew')).toBe('kirocrew-dev')
  })
})

const slot = (key: string, parentKey?: string, peer?: string): Slot =>
  ({ key, title: key, peer_id: peer, parent: parentKey ? { slot: parentKey, key: parentKey } : null }) as unknown as Slot

describe('projectLineageRows', () => {
  it('draws each worker under the conductor that opened it, in lane order', () => {
    // Lane order is recency: a worker that spoke last sits first in the input.
    const rows = projectLineageRows([
      slot('w2', 'c1'), slot('c2'), slot('w1', 'c1'), slot('c1'), slot('ww', 'w1'),
    ])
    expect(rows.map(r => [r.slot.key, r.depth])).toEqual([
      ['c2', 0],
      ['c1', 0], ['w2', 1], ['w1', 1], ['ww', 2],
    ])
  })

  it('leaves a worker whose creator is not in the folder at the top level', () => {
    const rows = projectLineageRows([slot('w', 'gone'), slot('c')])
    expect(rows.map(r => [r.slot.key, r.depth])).toEqual([['w', 0], ['c', 0]])
  })

  it('never nests a peer row under a local row that shares its key', () => {
    const rows = projectLineageRows([slot('c'), slot('w', 'c', 'peer-1')])
    expect(rows.map(r => r.depth)).toEqual([0, 0])
  })
})

describe('useProjectAgentLocked', () => {
  const wrapper = (folders: ChatFolder[]) => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
    qc.setQueryData(['chat-folders'], folders)
    return ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  }

  it('locks the picker for a chat anywhere in a project, and nowhere else', () => {
    const w = wrapper(TREE)
    expect(renderHook(() => useProjectAgentLocked('p'), { wrapper: w }).result.current).toBe(true)
    expect(renderHook(() => useProjectAgentLocked('p-sub'), { wrapper: w }).result.current).toBe(true)
    expect(renderHook(() => useProjectAgentLocked('plain'), { wrapper: w }).result.current).toBe(false)
    expect(renderHook(() => useProjectAgentLocked(''), { wrapper: w }).result.current).toBe(false)
  })
})

function open(props: Partial<React.ComponentProps<typeof FolderConfigModal>> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(undefined)
  render(
    <FolderConfigModal
      open={true}
      mode="create"
      parentId=""
      folders={TREE}
      installedAgents={[{ name: 'kirocrew' }, { name: 'kirocrew-dev' }]}
      onClose={vi.fn()}
      onSubmit={onSubmit}
      onRetryTags={vi.fn()}
      availableTags={[]}
      {...props}
    />
  )
  return { onSubmit }
}

describe('FolderConfigModal for projects', () => {
  beforeEach(() => vi.clearAllMocks())

  it('New > Project asks only for a name and a directory, and names the agent it runs on', async () => {
    const { onSubmit } = open({ kind: 'project' })
    expect(screen.getByText('New project')).toBeInTheDocument()
    expect(screen.getByTestId('folder-config-project-dir')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Default agent' })).toBeNull()
    expect(screen.queryByTestId('folder-config-icon')).toBeNull()
    expect(screen.queryByTestId('folder-config-color-reset')).toBeNull()
    expect(screen.queryByTestId('folder-config-steering-add')).toBeNull()
    expect(screen.queryByTestId('folder-config-tags-empty')).toBeNull()
    expect(screen.getByTestId('folder-config-project-agent')).toHaveTextContent(PROJECT_AGENT)
    fireEvent.change(screen.getByTestId('folder-config-name'), { target: { value: 'Ship it' } })
    fireEvent.change(screen.getByTestId('folder-config-project-dir'), { target: { value: '/work/ship' } })
    fireEvent.click(screen.getByTestId('folder-config-submit'))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ name: 'Ship it', projectDir: '/work/ship' })
    expect(screen.getByTestId('folder-config-submit')).toHaveTextContent('Create project')
  })

  it('a folder inside a project shows no agent picker in its settings', () => {
    open({ mode: 'edit', folder: TREE[1] })
    expect(screen.queryByRole('button', { name: 'Default agent' })).toBeNull()
    expect(screen.getByTestId('folder-config-project-agent')).toHaveTextContent(PROJECT_AGENT)
  })

  it('a new subfolder of a project shows no agent picker either', () => {
    open({ parentId: 'p' })
    expect(screen.queryByRole('button', { name: 'Default agent' })).toBeNull()
  })

  it('an ordinary folder keeps its agent picker and offers no project toggle', () => {
    open({ mode: 'edit', folder: TREE[2] })
    expect(screen.getByRole('button', { name: 'Default agent' })).toBeInTheDocument()
    expect(screen.queryByTestId('folder-config-project-agent')).toBeNull()
  })
})
