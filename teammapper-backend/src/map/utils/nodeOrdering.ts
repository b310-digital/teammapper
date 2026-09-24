import { Logger } from '@nestjs/common'
import { MmpNode } from '../entities/mmpNode.entity'
import { assignOrderNumbers, sortNodesParentFirst } from '@teammapper/shared'

// Orders nodes tree by tree, main tree first, parents before children, with
// sequential orderNumbers. Leaves out every node no root reaches, since such
// a node can never pass the parent foreign key.
export const orderNodesFromRoot = (
  nodes: ReadonlyArray<Partial<MmpNode>>
): Partial<MmpNode>[] => {
  const adapted = nodes.map((n) => ({
    node: n,
    id: n.id ?? '',
    parent: n.nodeParentId ?? null,
    isRoot: Boolean(n.root),
  }))

  const { ordered, unreached } = sortNodesParentFirst(adapted)
  logUnreached(unreached.map((a) => a.id))
  return assignOrderNumbers(ordered.map((a) => ({ ...a.node })))
}

const logUnreached = (ids: string[]): void => {
  if (ids.length === 0) return
  Logger.warn(
    `Leaving out ${ids.length} nodes no root reaches: ${ids.join(', ')}`,
    'orderNodesFromRoot'
  )
}
