import type Nodes from './nodes.js';
import { fakeDraw } from '../../test/fake-draw.js';
import { nodeRecord, stubMap } from '../../test/stub-map.js';
import { DefaultNodeValues } from '../options.js';
import type { ResolvedNode } from '../data/node-record.js';
import { NODE_HORIZONTAL_SPACING, type Bounds } from './node-geometry.js';
import {
  NEW_TREE_FOOTPRINT,
  NEW_TREE_GAP,
  treeBounds,
} from './tree-placement.js';
import type { MapNodeDimensions, MapSnapshot } from '@teammapper/shared';

/**
 * A map may hold several trees. A node with no parent is a root, whatever its
 * isRoot attribute holds. Nodes measures sides, sibling navigation and branch
 * colors against the root of each node's own tree.
 */

interface NodesInternals {
  moveSelectionOnLevel(selected: ResolvedNode, direction: boolean): void;
  moveSelectionOnBranch(selected: ResolvedNode, direction: boolean): void;
}

const ROOT = nodeRecord({ id: 'root', isRoot: true });
const BRANCH = nodeRecord({
  id: 'branch',
  parent: 'root',
  coordinates: { x: 200, y: 0 },
});
const SECOND_ROOT = nodeRecord({
  id: 'second-root',
  coordinates: { x: 1000, y: 0 },
  colors: { ...DefaultNodeValues.colors, branch: '' },
});

/**
 * The main tree (root, branch) and a second root, plus `extra`, with the
 * branch selected. `view` is the visible area the zoom stub reports. The
 * default null stands for jsdom's svg, which has no size.
 */
function makeMap(view: Bounds | null = null, extra: MapSnapshot = []) {
  const sizes = new Map<string, MapNodeDimensions>();
  const zoom = {
    center: jest.fn(),
    visibleArea: jest.fn(() => view),
    panIntoView: jest.fn(),
  };
  const stub = stubMap([ROOT, BRANCH, SECOND_ROOT, ...extra], {
    draw: fakeDraw(node => sizes.get(node.id) ?? { width: 0, height: 0 }),
    zoom,
  });
  stub.nodes.selectNode('branch');
  const internals = stub.nodes as unknown as NodesInternals;

  return { ...stub, handler: stub.nodes, internals, zoom, sizes };
}

function record(handler: Nodes, id: string): ResolvedNode {
  const node = handler.record(id);
  if (!node) throw new Error('no node ' + id);
  return node;
}

/** Add a node and return its export properties. */
function addNode(handler: Nodes, ...args: Parameters<Nodes['addNode']>) {
  return handler.getNodeProperties(handler.addNode(...args));
}

describe('addNodes', () => {
  it('keeps a root parentless whatever node is selected', () => {
    const { handler } = makeMap();

    handler.addNodes([
      nodeRecord({ id: 'third-root', coordinates: { x: 2000, y: 0 } }),
    ]);

    expect(handler.parentOf('third-root')).toBeNull();
    expect(handler.children('branch')).toEqual([]);
  });

  it('attaches the nodes of a second tree to their own root', () => {
    const { handler } = makeMap();

    handler.addNodes([
      nodeRecord({ id: 'third-root', coordinates: { x: 2000, y: 0 } }),
      nodeRecord({
        id: 'child',
        parent: 'third-root',
        coordinates: { x: 1800, y: -120 },
      }),
      nodeRecord({
        id: 'grandchild',
        parent: 'child',
        coordinates: { x: 1600, y: -240 },
      }),
    ]);

    expect(handler.parentOf('third-root')).toBeNull();
    expect(handler.parentOf('child')).toBe('third-root');
    expect(handler.parentOf('grandchild')).toBe('child');
    expect(handler.children('branch')).toEqual([]);
  });

  it('draws the map once for all added nodes', () => {
    const { handler, draw } = makeMap();
    draw.update.mockClear();

    handler.addNodes([
      nodeRecord({ id: 'third-root', coordinates: { x: 2000, y: 0 } }),
      nodeRecord({
        id: 'child',
        parent: 'third-root',
        coordinates: { x: 1800, y: -120 },
      }),
    ]);

    expect(draw.update).toHaveBeenCalledTimes(1);
  });
});

describe('addNode', () => {
  it('adds a root for an explicit null parent', () => {
    const { handler } = makeMap();

    const added = addNode(
      handler,
      { coordinates: { x: 2000, y: 0 } },
      false,
      null
    );

    expect(added?.parent).toBe('');
    expect(added?.isRoot).toBe(false);
  });

  it('gives a root branch color empty by default', () => {
    const { handler } = makeMap();

    const added = addNode(
      handler,
      { coordinates: { x: 2000, y: 0 } },
      false,
      null
    );

    expect(added?.colors?.branch).toBe('');
  });

  it('attaches a child to a second root', () => {
    const { handler } = makeMap();

    const added = addNode(handler, {}, false, 'second-root');

    expect(added?.parent).toBe('second-root');
    expect(added?.coordinates).toEqual({ x: 800, y: -120 });
  });

  it('leaves the selection where it was', () => {
    const { handler } = makeMap();

    handler.addNode({}, false, 'second-root');

    expect(handler.getSelectedNode()?.id).toBe('branch');
  });
});

describe('newTreeCoordinates', () => {
  function sizeNodes(sizes: Map<string, MapNodeDimensions>, width: number) {
    for (const id of ['root', 'branch', 'second-root']) {
      sizes.set(id, { width, height: 30 });
    }
  }

  it('places the new root two spacings right of the bounding box of every tree', () => {
    const { handler, sizes } = makeMap();
    sizeNodes(sizes, 120);
    const rightEdge = 1000 + 60;

    expect(handler.newTreeCoordinates().x).toBe(
      rightEdge + 2 * NODE_HORIZONTAL_SPACING
    );
  });

  it("keeps the new root's first child clear of the other trees", () => {
    const { handler, sizes } = makeMap();
    sizeNodes(sizes, 120);
    const rightEdge = 1000 + 60;
    const root = addNode(
      handler,
      { coordinates: handler.newTreeCoordinates() },
      false,
      null
    );
    if (!root) throw new Error('addNode added no root');

    const child = addNode(handler, {}, false, root.id);
    if (!child?.coordinates || !root.coordinates) {
      throw new Error('addNode added no child');
    }

    expect(child.coordinates.x).toBeLessThan(root.coordinates.x);
    expect(child.coordinates.x - 60).toBeGreaterThan(rightEdge);
  });

  it("measures the right edge from each node's width", () => {
    const { handler, sizes } = makeMap(null);
    sizeNodes(sizes, 100);
    handler.updateNode('coordinates', { x: 950, y: 0 }, true, 'branch');
    sizes.set('branch', { width: 400, height: 30 });

    expect(handler.newTreeCoordinates().x).toBe(
      1150 + 2 * NODE_HORIZONTAL_SPACING
    );
  });

  it('keeps the new root level with the main root', () => {
    const { handler } = makeMap();
    handler.updateNode('coordinates', { x: 0, y: 340 }, true, 'root');
    handler.updateNode(
      'coordinates',
      { x: 1000, y: -500 },
      true,
      'second-root'
    );

    expect(handler.newTreeCoordinates().y).toBe(340);
  });

  it('keeps the placed root at its coordinates when it is added', () => {
    const { handler } = makeMap();
    const coordinates = handler.newTreeCoordinates();

    const added = addNode(handler, { coordinates }, false, null);

    expect(added?.coordinates).toEqual(coordinates);
    expect(added?.parent).toBe('');
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
    const records = handler.scan();
    const trees = treeBounds(
      [...records.values()],
      node => records.get(handler.treeRoot(node.id)) ?? node,
      handler.boundsOf
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
    const { handler, sizes } = makeMap({
      minX: 600,
      maxX: 1400,
      minY: -300,
      maxY: 300,
    });
    sizes.set('second-root', { width: 120, height: 60 });

    const coordinates = handler.newTreeCoordinates();

    // The footprint reaches 30 below the new root, and the second tree plus
    // the gap reaches 130 above y = 0. Rising 160 is the shortest move on
    // any side.
    expect(coordinates).toEqual({ x: 1000, y: -160 });
    expect(crowdsATree(handler, coordinates)).toBe(false);
  });

  it('places the new tree outside a viewport a tree fills and pans to it', () => {
    const view = { minX: 900, maxX: 1100, minY: -100, maxY: 100 };
    const { handler, zoom, sizes } = makeMap(view);
    sizes.set('second-root', { width: 2000, height: 1000 });

    const { x, y } = handler.newTreeCoordinates();
    const crowds = crowdsATree(handler, { x, y });
    const root = handler.addTree();
    if (!root) throw new Error('addTree added no root');

    const inView =
      x >= view.minX && x <= view.maxX && y >= view.minY && y <= view.maxY;
    expect(inView).toBe(false);
    expect(crowds).toBe(false);
    expect(root.coordinates).toEqual({ x, y });
    expect(zoom.panIntoView).toHaveBeenCalledWith(
      handler.boundsOf(record(handler, root.id))
    );
  });
});

describe('addTree', () => {
  it('adds a root with no parent and isRoot unset', () => {
    const { handler } = makeMap();

    const root = handler.getNodeProperties(handler.addTree());

    expect(root?.parent).toBe('');
    expect(root?.isRoot).toBe(false);
    expect(root?.coordinates).toEqual({
      x: 1000 + 2 * NODE_HORIZONTAL_SPACING,
      y: 0,
    });
  });

  it('selects the new root and pans the view to it', () => {
    const { handler, zoom } = makeMap();

    const root = handler.addTree();
    if (!root) throw new Error('addTree added no root');

    expect(handler.getSelectedNode()?.id).toBe(root.id);
    expect(zoom.panIntoView).toHaveBeenCalledWith(
      handler.boundsOf(record(handler, root.id))
    );
  });
});

describe('orientation', () => {
  it("reads the side against the root of the node's own tree", () => {
    const { handler } = makeMap(null, [
      nodeRecord({
        id: 'left-of-second',
        parent: 'second-root',
        coordinates: { x: 800, y: 0 },
      }),
    ]);

    expect(handler.orientation('left-of-second')).toBe(true);
    expect(handler.orientation('branch')).toBe(false);
  });

  it('gives every root no side', () => {
    const { handler } = makeMap();

    expect(handler.orientation('root')).toBeUndefined();
    expect(handler.orientation('second-root')).toBeUndefined();
  });
});

describe('treeRoot', () => {
  it('returns the ancestor with no parent', () => {
    const { handler } = makeMap(null, [
      nodeRecord({ id: 'child', parent: 'second-root' }),
      nodeRecord({ id: 'grandchild', parent: 'child' }),
    ]);

    expect(handler.treeRoot('grandchild')).toBe('second-root');
    expect(handler.treeRoot('second-root')).toBe('second-root');
  });

  it('stops at a cycle of ancestors', () => {
    const { handler } = makeMap(null, [
      nodeRecord({ id: 'first', parent: 'second' }),
      nodeRecord({ id: 'second', parent: 'first' }),
    ]);

    expect(handler.treeRoot('first')).toBe('second');
  });
});

describe('moveSelectionOnLevel', () => {
  it('stays on the side of the second root', () => {
    const { handler, internals } = makeMap(null, [
      nodeRecord({
        id: 'left',
        parent: 'second-root',
        coordinates: { x: 800, y: 0 },
      }),
      nodeRecord({
        id: 'right',
        parent: 'second-root',
        coordinates: { x: 1200, y: 100 },
      }),
      nodeRecord({
        id: 'left-low',
        parent: 'second-root',
        coordinates: { x: 800, y: 200 },
      }),
    ]);
    // A node id 'left' reads as a direction, so the spy selects nothing.
    const selectNode = jest
      .spyOn(handler, 'selectNode')
      .mockImplementation(() => null);

    internals.moveSelectionOnLevel(record(handler, 'left'), false);

    expect(selectNode).toHaveBeenCalledWith('left-low');
  });
});

describe('moveSelectionOnBranch', () => {
  function selectionFromSecondRoot(direction: boolean): unknown[] {
    const { handler, internals } = makeMap(null, [
      nodeRecord({
        id: 'left',
        parent: 'second-root',
        coordinates: { x: 800, y: 0 },
      }),
      nodeRecord({
        id: 'right',
        parent: 'second-root',
        coordinates: { x: 1200, y: 0 },
      }),
    ]);
    // A node id 'left' reads as a direction, so the spy selects nothing.
    const selectNode = jest
      .spyOn(handler, 'selectNode')
      .mockImplementation(() => null);

    internals.moveSelectionOnBranch(record(handler, 'second-root'), direction);

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
    const { handler } = makeMap();

    expect(() =>
      handler.updateNode('branchColor', '#ff0000', true, 'second-root')
    ).toThrow('A root node has no branches');
    expect(handler.record('second-root')?.colors.branch).toBe('');
  });

  it('accepts the unchanged branch color of a root, as a colors sync sends it', () => {
    const { handler, draw } = makeMap(null, [
      nodeRecord({
        id: 'third-root',
        colors: { ...DefaultNodeValues.colors, branch: '#577a96' },
      }),
    ]);

    handler.updateNode('branchColor', '#577a96', false, 'third-root');

    expect(handler.record('third-root')?.colors.branch).toBe('#577a96');
    expect(draw.renderNodeProperty).not.toHaveBeenCalled();
  });
});
