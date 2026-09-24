import {
  assignOrderNumbers,
  collectSubtreeIds,
  collectTreeIds,
  findMainRoot,
  findRootNodes,
  sortNodesParentFirst,
  TreeNodeLike,
} from './tree';

const idsOf = (nodes: TreeNodeLike[]): string[] => nodes.map(n => n.id);

describe('Tree Algorithms', () => {
  describe('sortNodesParentFirst', () => {
    it('returns empty groups when given empty input', () => {
      expect(sortNodesParentFirst([])).toEqual({ ordered: [], unreached: [] });
    });

    it('returns single root node unchanged', () => {
      const root: TreeNodeLike = { id: 'root', isRoot: true, parent: null };
      expect(sortNodesParentFirst([root])).toEqual({
        ordered: [root],
        unreached: [],
      });
    });

    it('orders root first and parents before children in standard hierarchy', () => {
      const nodes: TreeNodeLike[] = [
        { id: 'gc1', parent: 'c1' },
        { id: 'c2', parent: 'root' },
        { id: 'root', isRoot: true, parent: null },
        { id: 'c1', parent: 'root' },
      ];

      const ids = idsOf(sortNodesParentFirst(nodes).ordered);

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
      expect(idsOf(result.ordered)).toEqual(['root', 'A', 'B', 'C', 'D']);
    });

    it('orders two roots with the main root first', () => {
      const nodes: TreeNodeLike[] = [
        { id: 'second', parent: null },
        { id: 'main', isRoot: true, parent: null },
      ];

      const result = sortNodesParentFirst(nodes);
      expect(idsOf(result.ordered)).toEqual(['main', 'second']);
    });

    it('walks each tree to completion before the next, main tree first', () => {
      const nodes: TreeNodeLike[] = [
        { id: 'secondChild', parent: 'second' },
        { id: 'mainGrandchild', parent: 'mainChild' },
        { id: 'mainChild', parent: 'main' },
        { id: 'second', parent: null },
        { id: 'main', isRoot: true, parent: null },
      ];

      const result = sortNodesParentFirst(nodes);
      expect(idsOf(result.ordered)).toEqual([
        'main',
        'mainChild',
        'mainGrandchild',
        'second',
        'secondChild',
      ]);
    });

    it('puts an orphan and its descendants in `unreached`', () => {
      const nodes: TreeNodeLike[] = [
        { id: 'root', isRoot: true, parent: null },
        { id: 'orphan2', parent: 'orphan1' },
        { id: 'child', parent: 'root' },
        { id: 'orphan1', parent: 'non-existent-parent' },
      ];

      const result = sortNodesParentFirst(nodes);

      expect(idsOf(result.ordered)).toEqual(['root', 'child']);
      expect(idsOf(result.unreached)).toEqual(['orphan2', 'orphan1']);
    });

    it('puts a 2-node cycle (A -> B -> A) in `unreached`', () => {
      const nodes: TreeNodeLike[] = [
        { id: 'root', isRoot: true, parent: null },
        { id: 'A', parent: 'B' },
        { id: 'B', parent: 'A' },
      ];

      const result = sortNodesParentFirst(nodes);

      expect(idsOf(result.ordered)).toEqual(['root']);
      expect(idsOf(result.unreached)).toEqual(['A', 'B']);
    });

    it('puts a self-referencing node (A -> A) in `unreached`', () => {
      const nodes: TreeNodeLike[] = [
        { id: 'root', isRoot: true, parent: null },
        { id: 'A', parent: 'A' },
      ];

      const result = sortNodesParentFirst(nodes);

      expect(idsOf(result.ordered)).toEqual(['root']);
      expect(idsOf(result.unreached)).toEqual(['A']);
    });

    it('puts a node that carries `isRoot` but has a parent in `unreached`', () => {
      const nodes: TreeNodeLike[] = [
        { id: 'root', isRoot: true, parent: 'child' },
        { id: 'child', parent: 'root' },
      ];

      const result = sortNodesParentFirst(nodes);

      expect(result.ordered).toEqual([]);
      expect(idsOf(result.unreached)).toEqual(['root', 'child']);
    });

    it('puts every node in `unreached` when no root is present', () => {
      const nodes: TreeNodeLike[] = [
        { id: 'a', parent: 'x' },
        { id: 'b', parent: 'y' },
      ];

      const result = sortNodesParentFirst(nodes);

      expect(result.ordered).toEqual([]);
      expect(result.unreached).toEqual(nodes);
      expect(result.unreached).not.toBe(nodes);
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
      const nodes: TreeNodeLike[] = [
        { id: 'root', isRoot: true, parent: null },
      ];
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

  describe('collectTreeIds', () => {
    const nodes: TreeNodeLike[] = [
      { id: 'main', isRoot: true, parent: null },
      { id: 'mainChild', parent: 'main' },
      { id: 'second', parent: null },
      { id: 'secondChild', parent: 'second' },
      { id: 'secondGrandchild', parent: 'secondChild' },
    ];

    it('returns a root followed by its descendants', () => {
      expect(collectTreeIds(nodes, 'second')).toEqual([
        'second',
        'secondChild',
        'secondGrandchild',
      ]);
    });

    it('returns a root without children alone', () => {
      expect(collectTreeIds([{ id: 'solo', parent: null }], 'solo')).toEqual([
        'solo',
      ]);
    });

    it('returns nothing for an unknown ID', () => {
      expect(collectTreeIds(nodes, 'nonexistent')).toEqual([]);
    });
  });

  describe('findMainRoot', () => {
    it('returns undefined for an empty node list', () => {
      expect(findMainRoot([])).toBeUndefined();
    });

    it('identifies the main root by explicit isRoot property', () => {
      const nodes: TreeNodeLike[] = [
        { id: 'second', parent: null },
        { id: 'c1', parent: 'r' },
        { id: 'r', isRoot: true, parent: null },
      ];
      expect(findMainRoot(nodes)?.id).toBe('r');
    });

    it('falls back to parent === null when isRoot is omitted', () => {
      const nodes: TreeNodeLike[] = [
        { id: 'c1', parent: 'r' },
        { id: 'r', parent: null },
      ];
      expect(findMainRoot(nodes)?.id).toBe('r');
    });

    it('falls back to parent === ""', () => {
      const nodes: TreeNodeLike[] = [
        { id: 'c1', parent: 'r' },
        { id: 'r', parent: '' },
      ];
      expect(findMainRoot(nodes)?.id).toBe('r');
    });
  });

  describe('findRootNodes', () => {
    it('returns empty array for an empty node list', () => {
      expect(findRootNodes([])).toEqual([]);
    });

    it('returns every parentless node with the main root first', () => {
      const nodes: TreeNodeLike[] = [
        { id: 'second', parent: null },
        { id: 'child', parent: 'main' },
        { id: 'third', parent: '' },
        { id: 'main', isRoot: true, parent: null },
      ];
      expect(idsOf(findRootNodes(nodes))).toEqual(['main', 'second', 'third']);
    });

    it('keeps input order when no parentless node carries `isRoot`', () => {
      const nodes: TreeNodeLike[] = [
        { id: 'b', parent: null },
        { id: 'a', parent: null },
      ];
      expect(idsOf(findRootNodes(nodes))).toEqual(['b', 'a']);
    });

    it('leaves out a node that carries `isRoot` but has a parent', () => {
      const nodes: TreeNodeLike[] = [
        { id: 'marked', isRoot: true, parent: 'other' },
        { id: 'other', parent: null },
      ];
      expect(idsOf(findRootNodes(nodes))).toEqual(['other']);
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
