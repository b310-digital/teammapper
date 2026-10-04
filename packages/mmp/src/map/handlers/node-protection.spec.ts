import CopyPaste from './copy-paste.js';
import Drag from './drag.js';
import Draw from './draw.js';
import Nodes from './nodes.js';
import { fakeDraw } from '../../test/fake-draw.js';
import MmpMap from '../map.js';
import Node, { NodeProperties } from '../models/node.js';
import { DefaultNodeValues } from '../options.js';
import type {
  ExportNodeProperties,
  MapNodeCoordinates,
} from '@teammapper/shared';
import type { D3DragEvent } from 'd3';

/**
 * A protected branch refuses local edits and announces the refusal with
 * `nodeProtected`. Remote writes, which arrive with notifyWithEvent false,
 * still apply.
 */

type DragEvent = D3DragEvent<SVGGElement, Node, unknown>;

interface DragInternals {
  started(event: DragEvent, node: Node): void;
  dragged(event: DragEvent, node: Node): void;
  ended(event: DragEvent, node: Node): void;
}

function makeNode(properties: Partial<NodeProperties> & { id: string }): Node {
  return new Node({
    k: 1,
    parent: null,
    colors: { ...DefaultNodeValues.colors },
    ...properties,
  });
}

/** root -> a -> b, root -> c, with `a` protected. */
function makeMap() {
  const events = { emit: jest.fn() };
  const map = {
    id: 'map',
    rootId: 'root',
    options: { defaultNode: DefaultNodeValues },
    draw: fakeDraw(),
    events,
  } as unknown as MmpMap;

  const nodes = new Nodes(map);
  map.nodes = nodes;
  nodes.fixCoordinates = (coordinates: MapNodeCoordinates) => coordinates;
  nodes.selectNode = jest.fn();
  nodes.redrawSelectionRing = jest.fn();

  const root = makeNode({ id: 'root', isRoot: true });
  const a = makeNode({
    id: 'a',
    parent: root,
    protected: true,
    coordinates: { x: 200, y: 0 },
  });
  const b = makeNode({ id: 'b', parent: a, coordinates: { x: 400, y: 0 } });
  const c = makeNode({ id: 'c', parent: root, coordinates: { x: -200, y: 0 } });
  const tree = { root, a, b, c };
  Object.values(tree).forEach(node => nodes.setNode(node));

  return { map, nodes, tree, events, clipboard: new CopyPaste(map) };
}

function calls(events: { emit: jest.Mock }, event: string): unknown[][] {
  return events.emit.mock.calls.filter(([name]) => name === event);
}

function refusals(events: { emit: jest.Mock }): string[] {
  return calls(events, 'nodeProtected').map(
    ([, properties]) => (properties as ExportNodeProperties).id
  );
}

function drag(map: MmpMap, node: Node, dx: number, dy: number) {
  const handler = new Drag(map) as unknown as DragInternals;
  const event = { dx, dy } as DragEvent;
  handler.started(event, node);
  handler.dragged(event, node);
  handler.ended(event, node);
}

describe('protectingNode', () => {
  it('returns the node carrying the flag for the node and its descendants', () => {
    const { nodes } = makeMap();

    expect(nodes.protectingNode('a')).toBe('a');
    expect(nodes.protectingNode('b')).toBe('a');
    expect(nodes.protectingNode('c')).toBeNull();
  });

  it('stops at a parent cycle', () => {
    const { nodes, tree } = makeMap();
    tree.a.protected = false;
    tree.a.parent = tree.b;

    expect(nodes.protectingNode('b')).toBeNull();
  });
});

describe('protectBranch', () => {
  it('moves the flag of a protected child to the protected parent', () => {
    const { nodes, tree } = makeMap();

    nodes.protectBranch('root');

    expect(tree.root.protected).toBe(true);
    expect(tree.a.protected).toBe(false);
    expect(nodes.protectingNode('b')).toBe('root');
  });

  it('announces every flag it writes', () => {
    const { nodes, events } = makeMap();

    nodes.protectBranch('root');

    const changed = calls(events, 'nodeUpdate').map(
      ([, update]) =>
        (update as { nodeProperties: ExportNodeProperties }).nodeProperties.id
    );
    expect(changed).toEqual(['a', 'root']);
  });

  it('does nothing for a node already protected by an ancestor', () => {
    const { nodes, tree } = makeMap();

    nodes.protectBranch('b');

    expect(tree.b.protected).toBe(false);
    expect(tree.a.protected).toBe(true);
  });
});

describe('releaseBranch', () => {
  it('releases the whole branch from a descendant', () => {
    const { nodes, tree } = makeMap();

    nodes.releaseBranch('b');

    expect(tree.a.protected).toBe(false);
    expect(nodes.protectingNode('b')).toBeNull();
  });
});

describe('local edits inside a protected branch', () => {
  it('refuses a rename and leaves the name unchanged', () => {
    const { nodes, tree, events } = makeMap();

    nodes.updateNode('name', 'new', true, 'b');

    expect(tree.b.name).toBe('');
    expect(refusals(events)).toEqual(['b']);
  });

  it('refuses a style change', () => {
    const { nodes, tree } = makeMap();

    nodes.updateNode('fontWeight', 'bold', true, 'a');

    expect(tree.a.font.weight).toBe('normal');
  });

  it('allows hiding and showing', () => {
    const { nodes, tree, events } = makeMap();

    nodes.updateNode('hidden', true, true, 'b');

    expect(tree.b.hidden).toBe(true);
    expect(refusals(events)).toEqual([]);
  });

  it('refuses removing an ancestor of a protected node', () => {
    const { nodes, tree, events } = makeMap();
    const d = makeNode({ id: 'd', parent: tree.root });
    nodes.setNode(d);
    tree.a.parent = d;

    nodes.removeNode('d');

    expect(nodes.existNode('d')).toBe(true);
    expect(nodes.existNode('a')).toBe(true);
    expect(refusals(events)).toEqual(['d']);
  });

  it('refuses adding a child', () => {
    const { nodes, events } = makeMap();

    const added = nodes.addNodeUnlessProtected({}, true, 'b');

    expect(added).toBeNull();
    expect(nodes.getNodes()).toHaveLength(4);
    expect(refusals(events)).toEqual(['b']);
  });

  it('adds a child to an unprotected node', () => {
    const { nodes } = makeMap();

    const added = nodes.addNodeUnlessProtected(
      { coordinates: { x: -400, y: 0 } },
      true,
      'c'
    );

    expect(added?.parent?.id).toBe('c');
  });

  it('refuses a cut and keeps the clipboard empty', () => {
    const { nodes, clipboard, events } = makeMap();

    expect(clipboard.cut('b')).toBe(false);
    expect(nodes.existNode('b')).toBe(true);
    expect(refusals(events)).toEqual(['b']);
  });

  it('refuses pasting onto a protected node', () => {
    const { nodes, clipboard, events } = makeMap();
    clipboard.copy('c');

    clipboard.paste('b');

    expect(nodes.getNodes()).toHaveLength(4);
    expect(refusals(events)).toEqual(['b']);
  });

  it('refuses editing the name', () => {
    const { map, tree, events } = makeMap();
    // The map was never drawn, so an editor that opened would throw.
    const draw = new Draw(map, document.createElement('div'));

    draw.enableNodeNameEditing(tree.b);

    expect(refusals(events)).toEqual(['b']);
  });
});

describe('changes that stay allowed', () => {
  it('applies a remote rename inside a protected branch', () => {
    const { nodes, tree, events } = makeMap();

    nodes.updateNode('name', 'remote', false, 'b');

    expect(tree.b.name).toBe('remote');
    expect(refusals(events)).toEqual([]);
  });

  it('applies a remote removal of a protected node', () => {
    const { nodes } = makeMap();

    nodes.removeNode('a', false);

    expect(nodes.existNode('a')).toBe(false);
    expect(nodes.existNode('b')).toBe(false);
  });

  it('pastes a copy of a protected branch unprotected', () => {
    const { nodes, clipboard, events } = makeMap();
    clipboard.copy('a');

    clipboard.paste('c');

    const pasted = (calls(events, 'nodePaste')[0][1] ??
      []) as ExportNodeProperties[];
    expect(pasted).toHaveLength(2);
    expect(pasted.every(node => node.protected === false)).toBe(true);
    expect(nodes.getNodes()).toHaveLength(6);
  });
});

describe('drag', () => {
  it('leaves a protected node at its position', () => {
    const { map, tree, events } = makeMap();

    drag(map, tree.b, 50, 50);

    expect(tree.b.coordinates).toEqual({ x: 400, y: 0 });
    expect(calls(events, 'nodeUpdate')).toHaveLength(0);
    expect(refusals(events)).toEqual(['b']);
  });

  it('moves a protected child along with its unprotected parent', () => {
    const { map, nodes, tree } = makeMap();
    nodes.releaseBranch('a');
    tree.b.protected = true;

    drag(map, tree.a, 50, 10);

    expect(tree.a.coordinates).toEqual({ x: 250, y: 10 });
    expect(tree.b.coordinates).toEqual({ x: 450, y: 10 });
  });
});
