import { MmpNode } from '../entities/mmpNode.entity'

// Groups non-root nodes by their parent ID
const groupByParentId = (
  nodes: ReadonlyArray<Partial<MmpNode>>
): ReadonlyMap<string, ReadonlyArray<Partial<MmpNode>>> =>
  nodes
    .filter((n) => !n.root)
    .reduce((acc, node) => {
      const pid = node.nodeParentId ?? ''
      acc.set(pid, [...(acc.get(pid) ?? []), node])
      return acc
    }, new Map<string, Partial<MmpNode>[]>())

// Recursive breadth-first search: processes head of queue, enqueues its children, accumulates result
const collectBreadthFirst = (
  queue: ReadonlyArray<Partial<MmpNode>>,
  childrenOf: ReadonlyMap<string, ReadonlyArray<Partial<MmpNode>>>,
  collected: ReadonlyArray<Partial<MmpNode>> = []
): ReadonlyArray<Partial<MmpNode>> => {
  if (queue.length === 0) return collected
  const [current, ...rest] = queue
  const kids = childrenOf.get(current.id ?? '') ?? []
  return collectBreadthFirst([...rest, ...kids], childrenOf, [...collected, current])
}

// Assigns sequential orderNumbers starting from 1
const assignOrderNumbers = (
  nodes: ReadonlyArray<Partial<MmpNode>>
): Partial<MmpNode>[] =>
  nodes.map((node, index) => ({ ...node, orderNumber: index + 1 }))

// Orders nodes via breadth-first search (root first, parents before children) with sequential orderNumbers
export const orderNodesFromRoot = (
  nodes: ReadonlyArray<Partial<MmpNode>>
): Partial<MmpNode>[] => {
  const root = nodes.find((n) => n.root)
  if (!root) return [...nodes]

  const childrenOf = groupByParentId(nodes)
  const ordered = collectBreadthFirst([root], childrenOf)
  return assignOrderNumbers(ordered)
}
