import { AiMapShape } from '@teammapper/shared'

interface OpenNode {
  indent: number
  kept: boolean
  children: number
}

interface PruneState {
  shape: AiMapShape
  // Nodes on the path from the root to the latest node, one per level.
  path: OpenNode[]
  // Whether the latest node survived, which decides its decoration lines.
  lastKept: boolean
  // Whether the tree has its root node yet; every later top-level node drops.
  rootSeen: boolean
}

const HEADER = /^\s*mindmap\s*$/i
// Lines that attach to the node above them rather than start a node: icons
// (`::icon(...)`), classes (`:::name`) and comments (`%%`).
const DECORATION = /^\s*(::|%%)/

/**
 * Removes the parts of LLM-written Mermaid `mindmap` syntax that exceed the
 * requested shape:
 *
 * - every line before the first `mindmap` header
 * - nodes deeper than `levels` below the root
 * - child nodes beyond the first `childrenPerNode` of a parent
 * - every top-level node after the root
 *
 * A removed node takes its descendants with it. The LLM does not follow the
 * shape in the prompt exactly, and the server can remove surplus nodes
 * without a second call. Every header starts a new tree.
 */
export const pruneMindmap = (mermaid: string, shape: AiMapShape): string => {
  let state: PruneState | null = null
  const kept: string[] = []
  for (const line of mermaid.split('\n')) {
    if (HEADER.test(line)) {
      state = { shape, path: [], lastKept: true, rootSeen: false }
    }
    if (keepLine(line, state)) kept.push(line)
  }
  return kept.join('\n')
}

/**
 * Decides whether one line survives. A line before the first header drops, a
 * header line and a blank line survive, and a decoration follows its node.
 */
const keepLine = (line: string, state: PruneState | null): boolean => {
  if (state === null) return false
  if (HEADER.test(line) || line.trim() === '') return true
  if (DECORATION.test(line)) return state.lastKept
  state.lastKept = keepNode(line.search(/\S/), state)
  return state.lastKept
}

/**
 * Places a node line by its indentation, the way the Mermaid parser does: the
 * parent is the nearest open node indented less. Records the node on the path
 * and reports whether it fits the shape.
 */
const keepNode = (indent: number, state: PruneState): boolean => {
  while (
    state.path.length > 0 &&
    state.path[state.path.length - 1].indent >= indent
  ) {
    state.path.pop()
  }
  const parent = state.path[state.path.length - 1]
  const kept = parent === undefined ? !state.rootSeen : fitsShape(parent, state)
  state.rootSeen = true
  state.path.push({ indent, kept, children: 0 })
  return kept
}

/** Reports whether a new child of `parent` fits, and counts it if so. */
const fitsShape = (parent: OpenNode, state: PruneState): boolean => {
  const level = state.path.length
  if (!parent.kept || level > state.shape.levels) return false
  if (parent.children >= state.shape.childrenPerNode) return false
  parent.children += 1
  return true
}
