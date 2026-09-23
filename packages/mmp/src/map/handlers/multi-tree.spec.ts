import Nodes from './nodes.js';
import Node, { NodeProperties } from '../models/node.js';
import { DefaultNodeValues } from '../options.js';
import MmpMap from '../map.js';
import { NODE_HORIZONTAL_SPACING } from './node-geometry.js';
import type { ExportNodeProperties } from '@teammapper/shared';

/**
 * A map may hold several trees. A node with no parent is a root, whether or
 * not it carries the main-root mark. Nodes measures sides, sibling navigation
 * and branch colors against the root of each node's own tree.
 */

interface NodesInternals {
  nodes: Map<string, Node>;
  selectedNode: Node;
  moveSelectionOnLevel(direction: boolean): void;
  moveSelectionOnBranch(direction: boolean): void;
}

function makeNode(properties: Partial<NodeProperties> & { id: string }): Node {
  return new Node({ k: 1, parent: null, ...properties });
}

function exported(
  id: string,
  parent: string,
  coordinates = { x: 0, y: 0 }
): ExportNodeProperties {
  return {
    ...DefaultNodeValues,
    id,
    parent,
    k: 1,
    coordinates,
    colors: { ...DefaultNodeValues.colors },
  };
}

function makeMap(): {
  handler: Nodes;
  internals: NodesInternals;
  nodes: Record<string, Node>;
  history: { save: jest.Mock };
} {
  const history = { save: jest.fn() };
  const map = {
    rootId: 'root',
    options: { defaultNode: DefaultNodeValues },
    draw: { update: jest.fn() },
    history,
  } as unknown as MmpMap;

  const handler = new Nodes(map);
  map.nodes = handler;
  const internals = handler as unknown as NodesInternals;

  const root = makeNode({ id: 'root', isRoot: true });
  const branch = makeNode({
    id: 'branch',
    parent: root,
    coordinates: { x: 200, y: 0 },
  });
  const secondRoot = makeNode({
    id: 'second-root',
    coordinates: { x: 1000, y: 0 },
  });

  const nodes = { root, branch, secondRoot };
  for (const node of Object.values(nodes)) internals.nodes.set(node.id, node);
  internals.selectedNode = branch;

  return { handler, internals, nodes, history };
}

describe('addNodes', () => {
  it('keeps a root parentless whatever node is selected', () => {
    const { handler, nodes } = makeMap();

    handler.addNodes([exported('third-root', '', { x: 2000, y: 0 })], false);

    expect(handler.getNode('third-root')?.parent).toBeNull();
    expect(handler.getChildren(nodes.branch)).toEqual([]);
  });

  it('attaches the nodes of a second tree to their own root', () => {
    const { handler, nodes } = makeMap();

    handler.addNodes(
      [
        exported('third-root', '', { x: 2000, y: 0 }),
        exported('child', 'third-root', { x: 1800, y: -120 }),
        exported('grandchild', 'child', { x: 1600, y: -240 }),
      ],
      false
    );

    expect(handler.getNode('third-root')?.parent).toBeNull();
    expect(handler.getNode('child')?.parent?.id).toBe('third-root');
    expect(handler.getNode('grandchild')?.parent?.id).toBe('child');
    expect(handler.getChildren(nodes.branch)).toEqual([]);
  });
});

describe('addNode', () => {
  it('adds a root for an explicit null parent', () => {
    const { handler } = makeMap();

    const added = handler.addNode(
      { coordinates: { x: 2000, y: 0 } },
      false,
      false,
      null
    );

    expect(added.parent).toBeNull();
    expect(added.isRoot).toBe(false);
  });

  it('gives a root branch color empty by default', () => {
    const { handler } = makeMap();

    const added = handler.addNode(
      { coordinates: { x: 2000, y: 0 } },
      false,
      false,
      null
    );

    expect(added.colors.branch).toBe('');
  });

  it('attaches a child to a second root', () => {
    const { handler, nodes } = makeMap();

    const added = handler.addNode({}, false, false, nodes.secondRoot.id);

    expect(added.parent).toBe(nodes.secondRoot);
    expect(added.coordinates).toEqual({ x: 800, y: -120 });
  });
});

describe('newTreeCoordinates', () => {
  function sizeNodes(nodes: Record<string, Node>, width: number): void {
    for (const node of Object.values(nodes)) {
      node.dimensions = { width, height: 30 };
    }
  }

  it('places the new root two spacings right of the bounding box of every tree', () => {
    const { handler, nodes } = makeMap();
    sizeNodes(nodes, 120);
    const rightEdge = nodes.secondRoot.coordinates.x + 60;

    expect(handler.newTreeCoordinates().x).toBe(
      rightEdge + 2 * NODE_HORIZONTAL_SPACING
    );
  });

  it("keeps the new root's first child clear of the other trees", () => {
    const { handler, nodes } = makeMap();
    sizeNodes(nodes, 120);
    const rightEdge = nodes.secondRoot.coordinates.x + 60;
    const root = handler.addNode(
      { coordinates: handler.newTreeCoordinates() },
      false,
      false,
      null
    );

    const child = handler.addNode({}, false, false, root.id);
    child.dimensions = { width: 120, height: 30 };

    expect(child.coordinates.x).toBeLessThan(root.coordinates.x);
    expect(child.coordinates.x - 60).toBeGreaterThan(rightEdge);
  });

  it("measures the right edge from each node's width", () => {
    const { handler, nodes } = makeMap();
    sizeNodes(nodes, 100);
    nodes.branch.coordinates = { x: 950, y: 0 };
    nodes.branch.dimensions = { width: 400, height: 30 };

    expect(handler.newTreeCoordinates().x).toBe(
      1150 + 2 * NODE_HORIZONTAL_SPACING
    );
  });

  it('keeps the new root level with the main root', () => {
    const { handler, nodes } = makeMap();
    nodes.root.coordinates = { x: 0, y: 340 };
    nodes.secondRoot.coordinates = { x: 1000, y: -500 };

    expect(handler.newTreeCoordinates().y).toBe(340);
  });

  it('keeps the placed root at its coordinates when it is added', () => {
    const { handler } = makeMap();
    const coordinates = handler.newTreeCoordinates();

    const added = handler.addNode({ coordinates }, false, false, null);

    expect(added.coordinates).toEqual(coordinates);
    expect(added.parent).toBeNull();
  });
});

describe('getOrientation', () => {
  it("reads the side against the root of the node's own tree", () => {
    const { handler, nodes } = makeMap();
    const leftOfSecond = makeNode({
      id: 'left-of-second',
      parent: nodes.secondRoot,
      coordinates: { x: 800, y: 0 },
    });

    expect(handler.getOrientation(leftOfSecond)).toBe(true);
    expect(handler.getOrientation(nodes.branch)).toBe(false);
  });

  it('gives every root no side', () => {
    const { handler, nodes } = makeMap();

    expect(handler.getOrientation(nodes.root)).toBeUndefined();
    expect(handler.getOrientation(nodes.secondRoot)).toBeUndefined();
  });
});

describe('getTreeRoot', () => {
  it('returns the ancestor with no parent', () => {
    const { handler, nodes } = makeMap();
    const child = makeNode({ id: 'child', parent: nodes.secondRoot });
    const grandchild = makeNode({ id: 'grandchild', parent: child });

    expect(handler.getTreeRoot(grandchild)).toBe(nodes.secondRoot);
    expect(handler.getTreeRoot(nodes.secondRoot)).toBe(nodes.secondRoot);
  });

  it('stops at a cycle of ancestors', () => {
    const { handler } = makeMap();
    const first = makeNode({ id: 'first' });
    const second = makeNode({ id: 'second', parent: first });
    first.parent = second;

    expect(handler.getTreeRoot(first)).toBe(second);
  });
});

describe('moveSelectionOnLevel', () => {
  it('stays on the side of the second root', () => {
    const { handler, internals, nodes } = makeMap();
    const children = [
      makeNode({
        id: 'left',
        parent: nodes.secondRoot,
        coordinates: { x: 800, y: 0 },
      }),
      makeNode({
        id: 'right',
        parent: nodes.secondRoot,
        coordinates: { x: 1200, y: 100 },
      }),
      makeNode({
        id: 'left-low',
        parent: nodes.secondRoot,
        coordinates: { x: 800, y: 200 },
      }),
    ];
    children.forEach(child => internals.nodes.set(child.id, child));
    internals.selectedNode = children[0];
    const selectNode = jest.fn();
    handler.selectNode = selectNode;

    internals.moveSelectionOnLevel(false);

    expect(selectNode).toHaveBeenCalledWith('left-low');
  });
});

describe('moveSelectionOnBranch', () => {
  function selectionFromSecondRoot(direction: boolean): string[] {
    const { handler, internals, nodes } = makeMap();
    const children = [
      makeNode({
        id: 'left',
        parent: nodes.secondRoot,
        coordinates: { x: 800, y: 0 },
      }),
      makeNode({
        id: 'right',
        parent: nodes.secondRoot,
        coordinates: { x: 1200, y: 0 },
      }),
    ];
    children.forEach(child => internals.nodes.set(child.id, child));
    internals.selectedNode = nodes.secondRoot;
    const selectNode = jest.fn();
    handler.selectNode = selectNode;

    internals.moveSelectionOnBranch(direction);

    return selectNode.mock.calls.map(call => call[0]);
  }

  it('moves a second root to its left-hand child on Left', () => {
    expect(selectionFromSecondRoot(true)).toEqual(['left']);
  });

  it('moves a second root to its right-hand child on Right', () => {
    expect(selectionFromSecondRoot(false)).toEqual(['right']);
  });
});

describe('updateNode branchColor', () => {
  it('refuses a branch color on a second root', () => {
    const { handler, nodes } = makeMap();

    expect(() =>
      handler.updateNode(
        'branchColor',
        '#ff0000',
        false,
        false,
        nodes.secondRoot.id
      )
    ).toThrow('A root node has no branches');
    expect(nodes.secondRoot.colors.branch).toBe('');
  });

  it('accepts the unchanged branch color of a root, as a colors sync sends it', () => {
    const { handler, nodes, history } = makeMap();
    nodes.secondRoot.colors.branch = '#577a96';

    handler.updateNode(
      'branchColor',
      '#577a96',
      false,
      true,
      nodes.secondRoot.id
    );

    expect(nodes.secondRoot.colors.branch).toBe('#577a96');
    expect(history.save).not.toHaveBeenCalled();
  });
});
