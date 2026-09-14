import {
  assignOrderNumbers,
  collectSubtreeIds,
  sortNodesParentFirst,
  TreeNodeLike,
} from './tree';

describe('Tree Algorithms', () => {
  describe('sortNodesParentFirst', () => {
    it('returns empty array when given empty input', () => {
      expect(sortNodesParentFirst([])).toEqual([]);
    });

    it('returns single root node unchanged', () => {
      const root: TreeNodeLike = { id: 'root', isRoot: true, parent: null };
      expect(sortNodesParentFirst([root])).toEqual([root]);
    });

    it('orders root first and parents before children in standard hierarchy', () => {
      const nodes: TreeNodeLike[] = [
        { id: 'gc1', parent: 'c1' },
        { id: 'c2', parent: 'root' },
        { id: 'root', isRoot: true, parent: null },
        { id: 'c1', parent: 'root' },
      ];

      const result = sortNodesParentFirst(nodes);
      const ids = result.map((n) => n.id);

      expect(ids[0]).toBe('root');
      expect(ids.indexOf('root')).toBeLessThan(ids.indexOf('c1'));
      expect(ids.indexOf('root')).toBeLessThan(ids.indexOf('c2'));
      expect(ids.indexOf('c1')).toBeLessThan(ids.indexOf('gc1'));
    });

    it('orders deep chain root -> A -> B -> C -> D', () => {
      const nodes: TreeNodeLike[] = [
        { id: 'D', parent: 'C' },
        { id: 'B', parent: 'A' },
        { id: 'root', isRoot: true, parent: null },
        { id: 'C', parent: 'B' },
        { id: 'A', parent: 'root' },
      ];

      const result = sortNodesParentFirst(nodes);
      expect(result.map((n) => n.id)).toEqual(['root', 'A', 'B', 'C', 'D']);
    });

    it('handles direct 2-node cycle (A -> B -> A) without infinite loop or stack overflow', () => {
      const nodes: TreeNodeLike[] = [
        { id: 'root', isRoot: true, parent: null },
        { id: 'A', parent: 'B' },
        { id: 'B', parent: 'A' },
      ];

      const result = sortNodesParentFirst(nodes);
      expect(result.length).toBe(3);
      expect(result[0].id).toBe('root');
      expect(result.map((n) => n.id)).toContain('A');
      expect(result.map((n) => n.id)).toContain('B');
    });

    it('handles self-referencing cycle (A -> A) safely', () => {
      const nodes: TreeNodeLike[] = [
        { id: 'root', isRoot: true, parent: null },
        { id: 'A', parent: 'A' },
      ];

      const result = sortNodesParentFirst(nodes);
      expect(result.map((n) => n.id)).toEqual(['root', 'A']);
    });

    it('handles child pointing back to root in cycle safely', () => {
      const nodes: TreeNodeLike[] = [
        { id: 'root', isRoot: true, parent: 'child' },
        { id: 'child', parent: 'root' },
      ];

      const result = sortNodesParentFirst(nodes);
      expect(result.map((n) => n.id)).toEqual(['root', 'child']);
    });

    it('handles 3-node cycle (A -> B -> C -> A) reachable from root', () => {
      const nodes: TreeNodeLike[] = [
        { id: 'root', isRoot: true, parent: null },
        { id: 'A', parent: 'C' },
        { id: 'B', parent: 'A' },
        { id: 'C', parent: 'B' },
      ];

      const result = sortNodesParentFirst(nodes);
      expect(result.length).toBe(4);
      expect(result[0].id).toBe('root');
    });

    it('appends orphaned nodes at the tail without dropping any nodes', () => {
      const nodes: TreeNodeLike[] = [
        { id: 'root', isRoot: true, parent: null },
        { id: 'child', parent: 'root' },
        { id: 'orphan1', parent: 'non-existent-parent' },
        { id: 'orphan2', parent: 'orphan1' },
      ];

      const result = sortNodesParentFirst(nodes);
      const ids = result.map((n) => n.id);

      expect(ids.slice(0, 2)).toEqual(['root', 'child']);
      expect(ids).toContain('orphan1');
      expect(ids).toContain('orphan2');
      expect(ids.length).toBe(4);
    });

    it('returns copy of input nodes when no root is present', () => {
      const nodes: TreeNodeLike[] = [
        { id: 'a', parent: 'x' },
        { id: 'b', parent: 'y' },
      ];

      const result = sortNodesParentFirst(nodes);
      expect(result).toEqual(nodes);
      expect(result).not.toBe(nodes);
    });

    it('does not mutate input array or input node objects', () => {
      const nodes: TreeNodeLike[] = [
        { id: 'child', parent: 'root' },
        { id: 'root', isRoot: true, parent: null },
      ];
      const snapshot = JSON.parse(JSON.stringify(nodes));

      sortNodesParentFirst(nodes);

      expect(nodes).toEqual(snapshot);
    });
  });

  describe('collectSubtreeIds', () => {
    it('returns empty array when rootId has no children or does not exist', () => {
      const nodes: TreeNodeLike[] = [{ id: 'root', isRoot: true, parent: null }];
      expect(collectSubtreeIds(nodes, 'root')).toEqual([]);
      expect(collectSubtreeIds(nodes, 'nonexistent')).toEqual([]);
    });

    it('collects all descendants in hierarchical order', () => {
      const nodes: TreeNodeLike[] = [
        { id: 'root', isRoot: true, parent: null },
        { id: 'c1', parent: 'root' },
        { id: 'c2', parent: 'root' },
        { id: 'gc1', parent: 'c1' },
        { id: 'other', parent: 'unrelated' },
      ];

      const descendants = collectSubtreeIds(nodes, 'root');
      expect(descendants).toEqual(['c1', 'c2', 'gc1']);
    });

    it('breaks cycles when collecting subtree IDs', () => {
      const nodes: TreeNodeLike[] = [
        { id: 'A', parent: 'B' },
        { id: 'B', parent: 'A' },
      ];

      const descendants = collectSubtreeIds(nodes, 'A');
      expect(descendants).toEqual(['B']);
    });
  });

  describe('assignOrderNumbers', () => {
    it('assigns 1-based sequential orderNumber to each node', () => {
      const nodes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
      const result = assignOrderNumbers(nodes);

      expect(result).toEqual([
        { id: 'a', orderNumber: 1 },
        { id: 'b', orderNumber: 2 },
        { id: 'c', orderNumber: 3 },
      ]);
    });
  });
});
