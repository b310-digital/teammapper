import type { Bounds } from './node-geometry.js';
import { NEW_TREE_GAP, treeBounds } from './tree-placement.js';
import type { ResolvedNode } from '../data/node-record.js';
import { fakeDraw } from '../../test/fake-draw.js';
import { nodeRecord, stubMap } from '../../test/stub-map.js';
import type {
  ExportNodeProperties,
  MapNodeDimensions,
  MapSnapshot,
} from '@teammapper/shared';

/**
 * Delete, copy and paste act on a whole tree when the user picks its root.
 * The main root is the one node no user can delete, copy or cut, and every
 * pasted node gets `isRoot = false`.
 */

interface CopyPasteInternals {
  copiedNodes: ExportNodeProperties[];
}

/**
 * The main tree (root, branch) and a second tree whose root has a left-hand
 * child with a grandchild and a right-hand child.
 */
const SNAPSHOT: MapSnapshot = [
  nodeRecord({ id: 'root', isRoot: true }),
  nodeRecord({ id: 'branch', parent: 'root', coordinates: { x: 200, y: 0 } }),
  nodeRecord({ id: 'second', coordinates: { x: 1000, y: 0 } }),
  nodeRecord({
    id: 'left',
    parent: 'second',
    coordinates: { x: 800, y: -120 },
  }),
  nodeRecord({
    id: 'grandchild',
    parent: 'left',
    coordinates: { x: 600, y: -240 },
  }),
  nodeRecord({
    id: 'right',
    parent: 'second',
    coordinates: { x: 1200, y: -120 },
  }),
];

/**
 * A map holding SNAPSHOT plus `extra`. `view` is the visible area the zoom
 * stub reports; the default null stands for jsdom's svg, which has no size.
 */
function makeMap(view: Bounds | null = null, extra: MapSnapshot = []) {
  const sizes = new Map<string, MapNodeDimensions>();
  const zoom = {
    center: jest.fn(),
    visibleArea: jest.fn(() => view),
    panIntoView: jest.fn(),
  };
  const stub = stubMap([...SNAPSHOT, ...extra], {
    draw: fakeDraw(node => sizes.get(node.id) ?? { width: 0, height: 0 }),
    zoom,
  });
  const pastes: string[][] = [];
  stub.events.emit.mockImplementation((event: string, payload: unknown) => {
    if (event !== 'nodePaste') return;
    pastes.push((payload as ExportNodeProperties[]).map(node => node.id));
  });

  return { ...stub, clipboard: stub.map.copyPaste, zoom, sizes, pastes };
}

function ids(snapshot: readonly { id: string }[]): string[] {
  return snapshot.map(node => node.id).sort();
}

/** The nodes the last paste created, in the order the paste built them. */
function pastedNodes(context: ReturnType<typeof makeMap>): ResolvedNode[] {
  const last = context.pastes[context.pastes.length - 1] ?? [];
  return last.flatMap(id => context.nodes.record(id) ?? []);
}

describe('removeNode', () => {
  it('removes a second root together with every descendant', () => {
    const { nodes, data } = makeMap();

    nodes.removeNode('second');

    expect(ids(data.nodes())).toEqual(['branch', 'root']);
  });

  it('refuses to remove the main root while other trees exist', () => {
    const { nodes, data } = makeMap();

    expect(() => nodes.removeNode('root')).toThrow(
      'The root node can not be deleted'
    );
    expect(data.nodes()).toHaveLength(6);
  });
});

describe('copy and cut', () => {
  it('copies a second root with its tree', () => {
    const { clipboard } = makeMap();

    clipboard.copy('second');

    const copied = (clipboard as unknown as CopyPasteInternals).copiedNodes;
    expect(ids(copied)).toEqual(['grandchild', 'left', 'right', 'second']);
  });

  it('refuses to copy the main root and leaves the clipboard unchanged', () => {
    const { clipboard } = makeMap();
    clipboard.copy('second');

    expect(() => clipboard.copy('root')).toThrow(
      'The root node can not be copied'
    );
    const copied = (clipboard as unknown as CopyPasteInternals).copiedNodes;
    expect(copied[0].id).toBe('second');
  });

  it('keeps copies the map data does not share', () => {
    const { clipboard, data } = makeMap();
    clipboard.copy('second');

    data.updateNode('second', 'name', 'changed');

    const copied = (clipboard as unknown as CopyPasteInternals).copiedNodes;
    expect(copied[0].name).toBe('');
  });

  it('refuses to cut the main root and keeps it on the map', () => {
    const { clipboard, nodes } = makeMap();

    expect(() => clipboard.cut('root')).toThrow('The root node can not be cut');
    expect(nodes.existNode('root')).toBe(true);
    expect((clipboard as unknown as CopyPasteInternals).copiedNodes).toEqual(
      []
    );
  });

  it('cuts a second root with its tree', () => {
    const { clipboard, data } = makeMap();

    clipboard.cut('second');

    expect(ids(data.nodes())).toEqual(['branch', 'root']);
  });
});

describe('paste', () => {
  it('attaches a copied tree under the selected main root', () => {
    const context = makeMap();
    context.clipboard.copy('second');
    context.nodes.selectNode('root');

    context.clipboard.paste();

    const [pastedRoot, ...rest] = pastedNodes(context);
    expect(pastedRoot.parent).toBe('root');
    expect(rest).toHaveLength(3);
    expect(context.nodes.descendants(pastedRoot.id)).toHaveLength(3);
  });

  it('writes isRoot false on every pasted node', () => {
    const context = makeMap();
    context.clipboard.copy('left');
    const copied = (context.clipboard as unknown as CopyPasteInternals)
      .copiedNodes;
    copied.forEach(node => (node.isRoot = true));

    context.clipboard.paste('branch');

    const pasted = pastedNodes(context);
    expect(pasted).toHaveLength(2);
    expect(pasted.every(node => node.isRoot === false)).toBe(true);
  });

  it('pastes nothing with nothing selected', () => {
    const { clipboard, nodes, data } = makeMap();
    clipboard.copy('second');
    nodes.deselectNode();

    clipboard.paste();

    expect(data.nodes()).toHaveLength(6);
  });
});

describe('pasteTree', () => {
  function pasteSecondTree() {
    const context = makeMap();
    context.nodes.deselectNode();
    context.clipboard.copy('second');
    const expectedRoot = context.nodes.newTreeCoordinates();
    const selectNode = jest.spyOn(context.nodes, 'selectNode');

    context.clipboard.pasteTree();

    const pasted = pastedNodes(context);
    return { ...context, pasted, expectedRoot, selectNode };
  }

  it('pastes the copied nodes as an independent tree', () => {
    const { pasted, nodes } = pasteSecondTree();
    const [pastedRoot] = pasted;

    expect(pasted).toHaveLength(4);
    expect(nodes.parentOf(pastedRoot.id)).toBeNull();
    expect(nodes.descendants(pastedRoot.id)).toHaveLength(3);
  });

  it("writes isRoot false on every pasted node and branch color '' on the pasted root", () => {
    const { pasted } = pasteSecondTree();
    const [pastedRoot] = pasted;

    expect(pasted.every(node => node.isRoot === false)).toBe(true);
    expect(pastedRoot.colors.branch).toBe('');
  });

  it('places the pasted root where a new tree goes', () => {
    const { pasted, expectedRoot } = pasteSecondTree();

    expect(pasted[0].coordinates).toEqual(expectedRoot);
  });

  it('keeps every pasted node on the side of its tree it had', () => {
    const { pasted, expectedRoot } = pasteSecondTree();
    const offsets = pasted.map(node => [
      node.coordinates.x - expectedRoot.x,
      node.coordinates.y - expectedRoot.y,
    ]);

    expect(offsets.sort()).toEqual(
      [
        [0, 0],
        [-200, -120],
        [-400, -240],
        [200, -120],
      ].sort()
    );
  });

  it('keeps the offsets of a copied non-root subtree to its copied node', () => {
    const context = makeMap(null, [
      nodeRecord({
        id: 'inner',
        parent: 'right',
        coordinates: { x: 1100, y: -240 },
      }),
      nodeRecord({
        id: 'innermost',
        parent: 'inner',
        coordinates: { x: 1050, y: -360 },
      }),
    ]);
    context.clipboard.copy('right');
    const expectedRoot = context.nodes.newTreeCoordinates();

    context.clipboard.pasteTree();

    const offsets = pastedNodes(context).map(node => [
      node.coordinates.x - expectedRoot.x,
      node.coordinates.y - expectedRoot.y,
    ]);
    expect(offsets).toEqual([
      [0, 0],
      [-100, -120],
      [-150, -240],
    ]);
  });

  it('pastes a tree whatever node is selected', () => {
    const context = makeMap();
    context.clipboard.copy('second');
    context.nodes.selectNode('branch');

    context.clipboard.pasteTree();

    const [pastedRoot] = pastedNodes(context);
    expect(context.nodes.parentOf(pastedRoot.id)).toBeNull();
    expect(context.nodes.children('branch')).toEqual([]);
  });

  it('refuses to paste an empty clipboard', () => {
    const { clipboard } = makeMap();

    expect(() => clipboard.pasteTree()).toThrow(
      'There are not nodes in the mmp clipboard'
    );
  });

  it('leaves the selection alone and pans the view to the pasted tree', () => {
    const { pasted, nodes, selectNode, zoom } = pasteSecondTree();

    // No node has a size in these tests, so the bounding box of the pasted
    // nodes equals the copied footprint moved to the pasted root.
    const [pastedTree] = treeBounds(pasted, () => pasted[0], nodes.boundsOf);
    expect(selectNode).not.toHaveBeenCalled();
    expect(nodes.getSelectedNode()).toBeNull();
    expect(zoom.panIntoView).toHaveBeenCalledWith(pastedTree);
  });

  it('adds a second tree on a second paste with nothing selected', () => {
    const context = makeMap();
    context.nodes.deselectNode();
    context.clipboard.copy('second');

    context.clipboard.pasteTree();
    context.clipboard.pasteTree();

    const roots = context.pastes.map(([first]) => first);
    expect(roots).toHaveLength(2);
    expect(roots[0]).not.toBe(roots[1]);
    roots.forEach(root => expect(context.nodes.parentOf(root)).toBeNull());
    expect(context.data.nodes()).toHaveLength(14);
  });

  it('keeps the whole pasted tree clear of the other trees', () => {
    // The middle of the viewport, (1000, -100), lies on the second tree.
    const context = makeMap({ minX: 600, maxX: 1400, minY: -400, maxY: 200 });
    const size = { width: 120, height: 40 };
    context.data
      .nodes()
      .forEach(node => context.sizes.set(node.id, { ...size }));
    context.clipboard.copy('second');

    context.clipboard.pasteTree();

    const pasted = pastedNodes(context);
    const pastedIds = new Set(pasted.map(node => node.id));
    pasted.forEach(node => context.sizes.set(node.id, { ...size }));
    const [pastedTree] = treeBounds(
      pasted,
      () => pasted[0],
      context.nodes.boundsOf
    );
    const records = context.nodes.scan();
    const others = treeBounds(
      [...records.values()].filter(node => !pastedIds.has(node.id)),
      node => records.get(context.nodes.treeRoot(node.id)) ?? node,
      context.nodes.boundsOf
    );
    expect(others).toHaveLength(2);
    others.forEach(tree => {
      const clear =
        pastedTree.maxX <= tree.minX - NEW_TREE_GAP ||
        pastedTree.minX >= tree.maxX + NEW_TREE_GAP ||
        pastedTree.maxY <= tree.minY - NEW_TREE_GAP ||
        pastedTree.minY >= tree.maxY + NEW_TREE_GAP;
      expect(clear).toBe(true);
    });
  });
});
