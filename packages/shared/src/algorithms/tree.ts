export interface TreeNodeLike {
  id: string;
  parent?: string | null;
  isRoot?: boolean;
}

/** A node set split by whether a root reaches each node. */
export interface ParentFirstOrder<T> {
  /** Every node a root reaches, each parent before its children. */
  ordered: T[];
  /** Nodes no root reaches: orphaned nodes, their descendants, and nodes in a parent cycle. */
  unreached: T[];
}

/** A node is a root when it has no parent, whatever its `isRoot` mark says. */
function isParentless(node: TreeNodeLike): boolean {
  return node.parent == null || node.parent === '';
}

/**
 * Locates the main root, the one node per map that carries `isRoot`, falling
 * back to the first parentless node for data that carries no mark.
 */
export function findMainRoot<T extends TreeNodeLike>(
  nodes: readonly T[]
): T | undefined {
  return nodes.find(n => Boolean(n.isRoot)) ?? nodes.find(isParentless);
}

/**
 * Returns every parentless node in input order, except that a parentless main
 * root comes first.
 */
export function findRootNodes<T extends TreeNodeLike>(
  nodes: readonly T[]
): T[] {
  const roots = nodes.filter(isParentless);
  const mainIndex = roots.findIndex(n => Boolean(n.isRoot));
  if (mainIndex <= 0) return roots;
  const [main] = roots.splice(mainIndex, 1);
  return [main, ...roots];
}

/** Groups nodes by parent ID, discarding self-references. */
function groupChildrenByParent<T extends TreeNodeLike>(
  nodes: readonly T[]
): Map<string, T[]> {
  const childrenOf = new Map<string, T[]>();
  for (const node of nodes) {
    if (!node.parent || node.parent === node.id) continue;
    const siblings = childrenOf.get(node.parent) ?? [];
    siblings.push(node);
    childrenOf.set(node.parent, siblings);
  }
  return childrenOf;
}

/**
 * Returns the descendants of `startId` breadth-first. The walk skips any node
 * in `visited` and adds each node it reaches, so a cycle (A -> B -> A, or a
 * self-loop) cannot keep it running.
 */
function collectDescendants<T extends TreeNodeLike>(
  startId: string,
  childrenOf: Map<string, T[]>,
  visited: Set<string>
): T[] {
  const descendants: T[] = [];
  const queue = [startId];
  for (let head = 0; head < queue.length; head++) {
    for (const child of childrenOf.get(queue[head]) ?? []) {
      if (visited.has(child.id)) continue;
      visited.add(child.id);
      descendants.push(child);
      queue.push(child.id);
    }
  }
  return descendants;
}

/**
 * Walks each tree to completion before the next, main tree first, so every
 * parent precedes its children and each tree's nodes stay together.
 */
function walkFromRoots<T extends TreeNodeLike>(nodes: readonly T[]): T[] {
  const childrenOf = groupChildrenByParent(nodes);
  const visited = new Set<string>();
  const ordered: T[] = [];
  for (const root of findRootNodes(nodes)) {
    if (visited.has(root.id)) continue;
    visited.add(root.id);
    ordered.push(root, ...collectDescendants(root.id, childrenOf, visited));
  }
  return ordered;
}

/**
 * Returns the nodes any root reaches in `ordered`, each parent before its
 * children, and the rest in `unreached`, in input order. Expects unique IDs,
 * which the Y.Doc node map keys and the node primary key guarantee.
 */
export function sortNodesParentFirst<T extends TreeNodeLike>(
  nodes: readonly T[]
): ParentFirstOrder<T> {
  const ordered = walkFromRoots(nodes);
  const reached = new Set<T>(ordered);
  return { ordered, unreached: nodes.filter(n => !reached.has(n)) };
}

/** Collects the IDs of every descendant of `rootId` breadth-first. */
export function collectSubtreeIds<T extends TreeNodeLike>(
  nodes: readonly T[],
  rootId: string
): string[] {
  if (!rootId) return [];
  const childrenOf = groupChildrenByParent(nodes);
  const descendants = collectDescendants(rootId, childrenOf, new Set([rootId]));
  return descendants.map(n => n.id);
}

/**
 * Returns `rootId` followed by the IDs of its descendants, or nothing when no
 * node carries that ID. Any node ID works; a root ID yields its whole tree.
 */
export function collectTreeIds<T extends TreeNodeLike>(
  nodes: readonly T[],
  rootId: string
): string[] {
  if (!nodes.some(n => n.id === rootId)) return [];
  return [rootId, ...collectSubtreeIds(nodes, rootId)];
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
