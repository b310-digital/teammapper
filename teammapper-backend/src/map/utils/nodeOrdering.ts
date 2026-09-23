import { MmpNode } from '../entities/mmpNode.entity'
import { assignOrderNumbers, sortNodesParentFirst } from '@teammapper/shared'

// Orders nodes via breadth-first search (root first, parents before children) with sequential orderNumbers
export const orderNodesFromRoot = (
  nodes: ReadonlyArray<Partial<MmpNode>>
): Partial<MmpNode>[] => {
  const root = nodes.find((n) => n.root)
  if (!root) return [...nodes]

  const adapted = nodes.map((n) => ({
    node: n,
    id: n.id ?? '',
    parent: n.nodeParentId ?? null,
    isRoot: Boolean(n.root),
  }))

  const { ordered, unreached } = sortNodesParentFirst(adapted)
  return assignOrderNumbers(
    [...ordered, ...unreached].map((a) => ({ ...a.node }))
  )
}
