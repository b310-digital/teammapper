import Draw from './draw.js';
import { emitted, nodeRecord, stubMap } from '../../test/stub-map.js';
import type { ExportNodeProperties, MapSnapshot } from '@teammapper/shared';
import type { D3DragEvent } from 'd3';
import type MmpMap from '../map.js';

/**
 * A protected branch refuses local edits and announces the refusal with
 * `nodeProtected`. A peer's write straight to the map data still applies.
 */

type DragEvent = D3DragEvent<SVGGElement, string, unknown>;

interface DragInternals {
  started(event: DragEvent, id: string): void;
  dragged(event: DragEvent, id: string): void;
  ended(event: DragEvent, id: string): void;
}

/** root -> a -> b, root -> c, with `a` protected. */
const SNAPSHOT: MapSnapshot = [
  nodeRecord({ id: 'root', isRoot: true }),
  nodeRecord({
    id: 'a',
    parent: 'root',
    protected: true,
    coordinates: { x: 200, y: 0 },
  }),
  nodeRecord({ id: 'b', parent: 'a', coordinates: { x: 400, y: 0 } }),
  nodeRecord({ id: 'c', parent: 'root', coordinates: { x: -200, y: 0 } }),
];

function makeMap(snapshot: MapSnapshot = SNAPSHOT) {
  const stub = stubMap(snapshot);
  return { ...stub, clipboard: stub.map.copyPaste };
}

function refusals(emit: jest.Mock): string[] {
  return emitted(emit, 'nodeProtected').map(
    node => (node as ExportNodeProperties).id
  );
}

function drag(map: MmpMap, id: string, dx: number, dy: number) {
  const handler = map.drag as unknown as DragInternals;
  const event = { dx, dy } as DragEvent;
  handler.started(event, id);
  handler.dragged(event, id);
  handler.ended(event, id);
}

describe('protectingNode', () => {
  it('returns the node carrying the `protected` attribute for the node and its descendants', () => {
    const { nodes } = makeMap();

    expect(nodes.protectingNode('a')).toBe('a');
    expect(nodes.protectingNode('b')).toBe('a');
    expect(nodes.protectingNode('c')).toBeNull();
  });

  it('stops at a parent cycle', () => {
    const { nodes } = makeMap([
      nodeRecord({ id: 'root', isRoot: true }),
      nodeRecord({ id: 'a', parent: 'b' }),
      nodeRecord({ id: 'b', parent: 'a' }),
    ]);

    expect(nodes.protectingNode('b')).toBeNull();
  });
});

describe('protectBranch', () => {
  it('moves the `protected` attribute of a protected child to the protected parent', () => {
    const { nodes, data } = makeMap();

    nodes.protectBranch('root');

    expect(data.node('root')?.protected).toBe(true);
    expect(data.node('a')?.protected).toBe(false);
    expect(nodes.protectingNode('b')).toBe('root');
  });

  it('writes every protected attribute in one change', () => {
    const { nodes, data } = makeMap();
    const listener = jest.fn();
    data.subscribe(listener);

    nodes.protectBranch('root');

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].updated.sort()).toEqual(['a', 'root']);
  });

  it('does nothing for a node already protected by an ancestor', () => {
    const { nodes, data } = makeMap();

    nodes.protectBranch('b');

    expect(data.node('b')?.protected).toBe(false);
    expect(data.node('a')?.protected).toBe(true);
  });
});

describe('releaseBranch', () => {
  it('releases the whole branch from a descendant', () => {
    const { nodes, data } = makeMap();

    nodes.releaseBranch('b');

    expect(data.node('a')?.protected).toBe(false);
    expect(nodes.protectingNode('b')).toBeNull();
  });
});

describe('edits inside a protected branch', () => {
  it('refuses a rename and leaves the name unchanged', () => {
    const { nodes, data, events } = makeMap();

    nodes.updateNode('name', 'new', 'b');

    expect(data.node('b')?.name).toBe('');
    expect(refusals(events.emit)).toEqual(['b']);
  });

  it('refuses a style change', () => {
    const { nodes, data } = makeMap();

    nodes.updateNode('fontWeight', 'bold', 'a');

    expect(data.node('a')?.font?.weight).toBe('normal');
  });

  it('lets toggleBranchVisibility hide the child nodes of a protected node', () => {
    const { map, nodes, events } = makeMap();
    nodes.selectNode('a');
    events.emit.mockClear();

    nodes.toggleBranchVisibility();

    expect(map.viewState.hidesChildren('a')).toBe(true);
    expect(refusals(events.emit)).toEqual([]);
  });

  it('refuses removing an ancestor of a protected node', () => {
    const { nodes, events } = makeMap([
      ...SNAPSHOT.filter(node => node.id !== 'a'),
      nodeRecord({ id: 'd', parent: 'root' }),
      nodeRecord({ id: 'a', parent: 'd', protected: true }),
    ]);

    nodes.removeNode('d');

    expect(nodes.existNode('d')).toBe(true);
    expect(nodes.existNode('a')).toBe(true);
    expect(refusals(events.emit)).toEqual(['d']);
  });

  it('refuses adding a child', () => {
    const { nodes, data, events } = makeMap();

    const added = nodes.addNode({}, 'b');

    expect(added).toBeNull();
    expect(data.nodes()).toHaveLength(4);
    expect(refusals(events.emit)).toEqual(['b']);
  });

  it('adds a child to an unprotected node', () => {
    const { nodes } = makeMap();

    const added = nodes.addNode({ coordinates: { x: -400, y: 0 } }, 'c');

    expect(added?.parent).toBe('c');
  });

  it('refuses a cut and keeps the clipboard empty', () => {
    const { nodes, clipboard, events } = makeMap();

    expect(clipboard.cut('b')).toBe(false);
    expect(nodes.existNode('b')).toBe(true);
    expect(refusals(events.emit)).toEqual(['b']);
  });

  it('refuses pasting onto a protected node', () => {
    const { data, clipboard, events } = makeMap();
    clipboard.copy('c');

    clipboard.paste('b');

    expect(data.nodes()).toHaveLength(4);
    expect(refusals(events.emit)).toEqual(['b']);
  });

  it('refuses editing the name', () => {
    const { map, events } = makeMap();
    // The map was never drawn, so an editor that opened would throw.
    const draw = new Draw(map, document.createElement('div'));

    draw.enableNodeNameEditing('b');

    expect(refusals(events.emit)).toEqual(['b']);
  });
});

describe('changes that stay allowed', () => {
  it('applies a peer rename inside a protected branch', () => {
    const { data, events } = makeMap();

    data.updateNode('b', 'name', 'peer');

    expect(data.node('b')?.name).toBe('peer');
    expect(refusals(events.emit)).toEqual([]);
  });

  it('applies a peer removal of a protected node', () => {
    const { nodes, data } = makeMap();

    data.removeNode('a');

    expect(nodes.existNode('a')).toBe(false);
    expect(nodes.existNode('b')).toBe(false);
  });

  it('pastes a copy of a protected branch unprotected', () => {
    const { data, clipboard } = makeMap();
    const listener = jest.fn();
    data.subscribe(listener);
    clipboard.copy('a');

    clipboard.paste('c');

    const added: string[] = listener.mock.calls[0][0].added;
    expect(added).toHaveLength(2);
    expect(added.every(id => data.node(id)?.protected === false)).toBe(true);
    expect(data.nodes()).toHaveLength(6);
  });
});

describe('drag', () => {
  it('leaves a protected node at its position', () => {
    const { map, data, events } = makeMap();
    const listener = jest.fn();
    data.subscribe(listener);

    drag(map, 'b', 50, 50);

    expect(data.node('b')?.coordinates).toEqual({ x: 400, y: 0 });
    expect(listener).not.toHaveBeenCalled();
    expect(refusals(events.emit)).toEqual(['b']);
  });

  it('moves a protected child along with its unprotected parent', () => {
    const { map, nodes, data } = makeMap();
    nodes.releaseBranch('a');
    data.updateNode('b', 'protected', true);

    drag(map, 'a', 50, 10);

    expect(data.node('a')?.coordinates).toEqual({ x: 250, y: 10 });
    expect(data.node('b')?.coordinates).toEqual({ x: 450, y: 10 });
  });
});
