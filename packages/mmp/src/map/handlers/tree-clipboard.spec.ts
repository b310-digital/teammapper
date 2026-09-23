import CopyPaste from './copy-paste.js';
import Nodes from './nodes.js';
import MmpMap from '../map.js';
import Node, { NodeProperties } from '../models/node.js';
import { DefaultNodeValues } from '../options.js';
import { Event } from './events.js';
import type {
  ExportNodeProperties,
  MapNodeCoordinates,
} from '@teammapper/shared';

/**
 * Delete, copy and paste act on a whole tree when the user picks its root.
 * The main root is the one node no user can delete, copy or cut, and no
 * pasted node carries the main-root mark.
 */

interface CopyPasteInternals {
  copiedNodes: ExportNodeProperties[];
}

interface NodesInternals {
  selectedNode: Node | null;
}

function makeNode(properties: Partial<NodeProperties> & { id: string }): Node {
  return new Node({
    k: 1,
    parent: null,
    colors: { ...DefaultNodeValues.colors },
    ...properties,
  });
}

/**
 * A map holding the main tree (root, branch) and a second tree whose root
 * has a left-hand child with a grandchild and a right-hand child.
 */
function makeMap() {
  const events = { call: jest.fn() };
  const map = {
    rootId: 'root',
    options: { defaultNode: DefaultNodeValues },
    draw: { update: jest.fn(), clear: jest.fn() },
    history: { save: jest.fn() },
    events,
  } as unknown as MmpMap;

  const nodes = new Nodes(map);
  map.nodes = nodes;
  // No zoom transform applies in these tests, so this is the identity.
  nodes.fixCoordinates = (coordinates: MapNodeCoordinates) => coordinates;

  const root = makeNode({ id: 'root', isRoot: true });
  const branch = makeNode({
    id: 'branch',
    parent: root,
    coordinates: { x: 200, y: 0 },
  });
  const second = makeNode({ id: 'second', coordinates: { x: 1000, y: 0 } });
  const left = makeNode({
    id: 'left',
    parent: second,
    coordinates: { x: 800, y: -120 },
  });
  const grandchild = makeNode({
    id: 'grandchild',
    parent: left,
    coordinates: { x: 600, y: -240 },
  });
  const right = makeNode({
    id: 'right',
    parent: second,
    coordinates: { x: 1200, y: -120 },
  });

  const tree = { root, branch, second, left, grandchild, right };
  Object.values(tree).forEach(node => nodes.setNode(node.id, node));

  const clipboard = new CopyPaste(map);

  return { nodes, clipboard, tree, events };
}

function ids(nodes: Node[]): string[] {
  return nodes.map(node => node.id).sort();
}

/** The nodes the last paste created, read from its paste event. */
function pastedNodes(nodes: Nodes, events: { call: jest.Mock }): Node[] {
  const call = events.call.mock.calls.find(
    ([event]) => event === Event.nodePaste
  );
  const pasted = (call?.[2] ?? []) as ExportNodeProperties[];

  return pasted.map(properties => nodes.getNode(properties.id) as Node);
}

describe('removeNode', () => {
  it('removes a second root together with every descendant', () => {
    const { nodes } = makeMap();

    nodes.removeNode('second');

    expect(ids(nodes.getNodes())).toEqual(['branch', 'root']);
  });

  it('refuses to remove the main root while other trees exist', () => {
    const { nodes } = makeMap();

    expect(() => nodes.removeNode('root')).toThrow(
      'The root node can not be deleted'
    );
    expect(nodes.getNodes()).toHaveLength(6);
  });
});

describe('copy and cut', () => {
  it('copies a second root with its tree', () => {
    const { clipboard } = makeMap();

    clipboard.copy('second');

    const copied = (clipboard as unknown as CopyPasteInternals).copiedNodes;
    expect(copied.map(node => node.id).sort()).toEqual([
      'grandchild',
      'left',
      'right',
      'second',
    ]);
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

  it('refuses to cut the main root and keeps it on the map', () => {
    const { clipboard, nodes } = makeMap();

    expect(() => clipboard.cut('root')).toThrow('The root node can not be cut');
    expect(nodes.existNode('root')).toBe(true);
    expect((clipboard as unknown as CopyPasteInternals).copiedNodes).toEqual(
      []
    );
  });

  it('cuts a second root with its tree', () => {
    const { clipboard, nodes } = makeMap();

    clipboard.cut('second');

    expect(ids(nodes.getNodes())).toEqual(['branch', 'root']);
  });
});

describe('paste', () => {
  it('attaches a copied tree under the selected main root', () => {
    const { clipboard, nodes, tree, events } = makeMap();
    clipboard.copy('second');
    (nodes as unknown as NodesInternals).selectedNode = tree.root;

    clipboard.paste();

    const [pastedRoot, ...rest] = pastedNodes(nodes, events);
    expect(pastedRoot.parent).toBe(tree.root);
    expect(rest).toHaveLength(3);
    expect(nodes.getDescendants(pastedRoot)).toHaveLength(3);
  });

  it('writes no main-root mark on any pasted node', () => {
    const { clipboard, nodes, tree, events } = makeMap();
    clipboard.copy('left');
    const copied = (clipboard as unknown as CopyPasteInternals).copiedNodes;
    copied.forEach(node => (node.isRoot = true));

    clipboard.paste(tree.branch.id);

    const pasted = pastedNodes(nodes, events);
    expect(pasted).toHaveLength(2);
    expect(pasted.every(node => node.isRoot === false)).toBe(true);
  });

  it('pastes nothing with nothing selected', () => {
    const { clipboard, nodes } = makeMap();
    clipboard.copy('second');

    clipboard.paste();

    expect(nodes.getNodes()).toHaveLength(6);
  });
});

describe('pasteTree', () => {
  function pasteSecondTree() {
    const context = makeMap();
    context.clipboard.copy('second');
    const expectedRoot = context.nodes.newTreeCoordinates();

    context.clipboard.pasteTree();

    const pasted = pastedNodes(context.nodes, context.events);
    return { ...context, pasted, expectedRoot };
  }

  it('pastes the copied nodes as an independent tree', () => {
    const { pasted, nodes } = pasteSecondTree();
    const [pastedRoot] = pasted;

    expect(pasted).toHaveLength(4);
    expect(pastedRoot.parent).toBeNull();
    expect(nodes.getDescendants(pastedRoot)).toHaveLength(3);
  });

  it('gives the pasted root no main-root mark and branch color empty', () => {
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

  it('pastes a tree whatever node is selected', () => {
    const context = makeMap();
    context.clipboard.copy('second');
    (context.nodes as unknown as NodesInternals).selectedNode =
      context.tree.branch;

    context.clipboard.pasteTree();

    const [pastedRoot] = pastedNodes(context.nodes, context.events);
    expect(pastedRoot.parent).toBeNull();
    expect(context.nodes.getChildren(context.tree.branch)).toEqual([]);
  });

  it('refuses to paste an empty clipboard', () => {
    const { clipboard } = makeMap();

    expect(() => clipboard.pasteTree()).toThrow(
      'There are not nodes in the mmp clipboard'
    );
  });
});
