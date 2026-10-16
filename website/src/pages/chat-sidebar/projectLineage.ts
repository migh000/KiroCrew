/** Nesting inside a Project: each worker row under the conductor that opened it.
 *
 *  A project's conductor opens its workers through `session_create`, and the server
 *  files every one of them in the conductor's own folder (see
 *  `src/kiro_crew/dashboard/project_folders.py`), so they arrive as siblings of the
 *  conductor in the folder's row list. This orders that list as the lineage tree the
 *  conductor lane already builds (`buildLineage`, keyed the same way), so the folder
 *  body draws the conductor followed by its workers, indented one level per
 *  generation, rather than a flat recency list or a subfolder per worker agent.
 *
 *  Order is the lane's: roots keep the order the caller handed in, and so do the
 *  children under each root. A worker whose creator is not in `rows` (it closed, or a
 *  filter hides it) is a root, the same answer the conductor lane gives. */
import type { Slot } from './types'
import { buildLineage } from '../../lib/sessionLineage'
import { sessionRowIdentity } from './rowIdentity'
import { citedCreatorOf } from './conductor'

/** One row as a project folder draws it. */
export interface ProjectLineageRow {
  slot: Slot
  /** 0 for a conductor (a root), 1 for its worker, and so on. */
  depth: number
}

/** `rows` in lineage order, each with its nesting depth. Total: a payload it cannot
 *  nest comes back flat, in the order given. */
export function projectLineageRows(rows: readonly Slot[]): ProjectLineageRow[] {
  const byOrigin = new Map<string | undefined, Map<string, string>>()
  const byIdentity = new Map<string, Slot>()
  for (const s of rows) {
    let inOrigin = byOrigin.get(s.peer_id)
    if (inOrigin === undefined) {
      inOrigin = new Map<string, string>()
      byOrigin.set(s.peer_id, inOrigin)
    }
    inOrigin.set(s.key, sessionRowIdentity(s))
    byIdentity.set(sessionRowIdentity(s), s)
  }
  const tree = buildLineage(rows, {
    identityOf: sessionRowIdentity,
    parentIdentityOf: s => {
      const cited = citedCreatorOf(s)
      if (cited === null) return null
      return byOrigin.get(cited.origin)?.get(cited.key) ?? null
    },
  })
  const out: ProjectLineageRow[] = []
  const seen = new Set<string>()
  const emit = (id: string, depth: number) => {
    const slot = byIdentity.get(id)
    if (!slot || seen.has(id)) return
    seen.add(id)
    out.push({ slot, depth })
    for (const kid of tree.children.get(id) ?? []) emit(kid, depth + 1)
  }
  for (const root of tree.roots) emit(root, 0)
  return out
}
