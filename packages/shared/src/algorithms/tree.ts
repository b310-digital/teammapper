export interface TreeNodeLike {
  id: string;
  parent?: string | null;
  isRoot?: boolean;
}

/**
 * Locates the root node of a mindmap tree: prefers explicit isRoot flag,
 * falling back to parent === null or parent === ''.
 */
export function findRootNode<T extends TreeNodeLike>(
  nodes: readonly T[]
): T | undefined {
  if (!nodes || nodes.length === 0) return undefined;
  return (
    nodes.find((n) => Boolean(n.isRoot)) ??
    nodes.find((n) => n.parent == null || n.parent === '')
  );
}

/**
 * Iterative, cycle-safe breadth-first traversal that sorts nodes so root is first,
 * parents precede their children, and orphans/unreachable nodes are safely appended at the tail.
 *
 * Breaks cycles (e.g. A -> B -> A, self-loops) via a `visited` Set to prevent DoS/stack overflow.
 */
export function sortNodesParentFirst<T extends TreeNodeLike>(
  nodes: readonly T[]
): T[] {
  if (!nodes || nodes.length === 0) return [];

  const root = findRootNode(nodes);
  if (!root) return [...nodes];

  // Map non-root children by parent ID
  const childrenOf = new Map<string, T[]>();
  for (const node of nodes) {
    if (node === root) continue;
    // Discard self-references as parent
    if (node.parent && node.parent !== node.id) {
      const existing = childrenOf.get(node.parent);
      if (existing) {
        existing.push(node);
      } else {
        childrenOf.set(node.parent, [node]);
      }
    }
  }

  const ordered: T[] = [];
  const visited = new Set<string>([root.id]);
  const queue: T[] = [root];
  let head = 0;

  while (head < queue.length) {
    const current = queue[head++];
    ordered.push(current);

    const children = childrenOf.get(current.id);
    if (children) {
      for (const child of children) {
        if (!visited.has(child.id)) {
          visited.add(child.id);
          queue.push(child);
        }
      }
    }
  }

  // Recover orphaned nodes (nodes whose parent is missing or cycle-disconnected)
  for (const node of nodes) {
    if (!visited.has(node.id)) {
      visited.add(node.id);
      ordered.push(node);
    }
  }

  return ordered;
}

/**
 * Iteratively collects all descendant node IDs of a given root ID in a cycle-safe manner.
 */
export function collectSubtreeIds<T extends TreeNodeLike>(
  nodes: readonly T[],
  rootId: string
): string[] {
  if (!nodes || nodes.length === 0 || !rootId) return [];

  const childrenOf = new Map<string, string[]>();
  for (const node of nodes) {
    if (node.parent && node.parent !== node.id) {
      const existing = childrenOf.get(node.parent);
      if (existing) {
        existing.push(node.id);
      } else {
        childrenOf.set(node.parent, [node.id]);
      }
    }
  }

  const descendants: string[] = [];
  const visited = new Set<string>([rootId]);
  const queue: string[] = [rootId];
  let head = 0;

  while (head < queue.length) {
    const currentId = queue[head++];
    const children = childrenOf.get(currentId);
    if (children) {
      for (const childId of children) {
        if (!visited.has(childId)) {
          visited.add(childId);
          descendants.push(childId);
          queue.push(childId);
        }
      }
    }
  }

  return descendants;
}

/**
 * Helper to assign sequential 1-based order numbers to ordered nodes.
 */
export function assignOrderNumbers<T extends object>(
  nodes: readonly T[]
): (T & { orderNumber: number })[] {
  return nodes.map((node, index) => ({
    ...node,
    orderNumber: index + 1,
  }));
}
