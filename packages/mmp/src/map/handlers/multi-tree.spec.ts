import Nodes from './nodes.js';
import Node, { NodeProperties } from '../models/node.js';
import { DefaultNodeValues } from '../options.js';
import MmpMap from '../map.js';
import { NODE_HORIZONTAL_SPACING, type Bounds } from './node-geometry.js';
import {
  NEW_TREE_FOOTPRINT,
  NEW_TREE_GAP,
  nodeBounds,
  treeBounds,
} from './tree-placement.js';
import type { ExportNodeProperties } from '@teammapper/shared';

/**
 * A map may hold several trees. A node with no parent is a root, whether or
 * not it carries the main-root mark. Nodes measures sides, sibling navigation
 * and branch colors against the root of each node's own tree.
 */

interface NodesInternals {
  nodes: Map<string, Node>;
  selectedNode: Node | null;
  moveSelectionOnLevel(selected: Node, direction: boolean): void;
  moveSelectionOnBranch(selected: Node, direction: boolean): void;
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

/**
 * `view` is the visible area the zoom stub reports. The default null stands
 * for jsdom's svg, which has no size.
 */
function makeMap(view: Bounds | null = null): {
  handler: Nodes;
  internals: NodesInternals;
  nodes: Record<string, Node>;
  history: { save: jest.Mock };
  zoom: { visibleArea: jest.Mock; panIntoView: jest.Mock };
} {
  const history = { save: jest.fn() };
  const zoom = { visibleArea: jest.fn(() => view), panIntoView: jest.fn() };
  const map = {
    rootId: 'root',
    options: { defaultNode: DefaultNodeValues },
    draw: { update: jest.fn() },
    events: { call: jest.fn() },
    history,
    zoom,
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

  return { handler, internals, nodes, history, zoom };
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

describe('newTreeCoordinates with a viewport', () => {
  /** Whether the footprint at `point` comes within the gap of any tree. */
  function crowdsATree(handler: Nodes, point: { x: number; y: number }) {
    const placed = {
      minX: point.x + NEW_TREE_FOOTPRINT.minX,
      maxX: point.x + NEW_TREE_FOOTPRINT.maxX,
      minY: point.y + NEW_TREE_FOOTPRINT.minY,
      maxY: point.y + NEW_TREE_FOOTPRINT.maxY,
    };
    const trees = treeBounds(handler.getNodes(), node =>
      handler.getTreeRoot(node)
    );

    return trees.some(
      tree =>
        placed.minX < tree.maxX + NEW_TREE_GAP &&
        placed.maxX > tree.minX - NEW_TREE_GAP &&
        placed.minY < tree.maxY + NEW_TREE_GAP &&
        placed.maxY > tree.minY - NEW_TREE_GAP
    );
  }

  it('places the new root in the middle of a free viewport', () => {
    const { handler } = makeMap({
      minX: 3000,
      maxX: 3800,
      minY: -300,
      maxY: 300,
    });

    expect(handler.newTreeCoordinates()).toEqual({ x: 3400, y: 0 });
  });

  it('moves the new tree to the nearest clear spot when a tree fills the middle', () => {
    const { handler, nodes } = makeMap({
      minX: 600,
      maxX: 1400,
      minY: -300,
      maxY: 300,
    });
    nodes.secondRoot.dimensions = { width: 120, height: 60 };

    const coordinates = handler.newTreeCoordinates();

    // The footprint reaches 30 below the new root, and the second tree plus
    // the gap reaches 130 above y = 0. Rising 160 is the shortest move on
    // any side.
    expect(coordinates).toEqual({ x: 1000, y: -160 });
    expect(crowdsATree(handler, coordinates)).toBe(false);
  });

  it('places the new tree outside a viewport a tree fills and pans to it', () => {
    const view = { minX: 900, maxX: 1100, minY: -100, maxY: 100 };
    const { handler, nodes, zoom } = makeMap(view);
    nodes.secondRoot.dimensions = { width: 2000, height: 1000 };
    handler.selectNode = jest.fn();

    const { x, y } = handler.newTreeCoordinates();
    const crowds = crowdsATree(handler, { x, y });
    const root = handler.addTree();

    const inView =
      x >= view.minX && x <= view.maxX && y >= view.minY && y <= view.maxY;
    expect(inView).toBe(false);
    expect(crowds).toBe(false);
    expect(root.coordinates).toEqual({ x, y });
    expect(zoom.panIntoView).toHaveBeenCalledWith(nodeBounds(root));
  });
});

describe('addTree', () => {
  it('adds a root with no parent and no main-root mark', () => {
    const { handler } = makeMap();
    handler.selectNode = jest.fn();

    const root = handler.addTree();

    expect(root.parent).toBeNull();
    expect(root.isRoot).toBe(false);
    expect(root.coordinates).toEqual({
      x: 1000 + 2 * NODE_HORIZONTAL_SPACING,
      y: 0,
    });
  });

  it('selects the new root and pans the view to it', () => {
    const { handler, zoom } = makeMap();
    const selectNode = jest.fn();
    handler.selectNode = selectNode;

    const root = handler.addTree();

    expect(selectNode).toHaveBeenCalledWith(root.id);
    expect(zoom.panIntoView).toHaveBeenCalledWith(nodeBounds(root));
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
    const selectNode = jest.fn();
    handler.selectNode = selectNode;

    internals.moveSelectionOnLevel(children[0], false);

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
    const selectNode = jest.fn();
    handler.selectNode = selectNode;

    internals.moveSelectionOnBranch(nodes.secondRoot, direction);

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
