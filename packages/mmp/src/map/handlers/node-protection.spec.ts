import Draw from './draw.js';
import { emitted, nodeRecord, stubMap } from '../../test/stub-map.js';
import type { ExportNodeProperties, MapSnapshot } from '@teammapper/shared';
import type { D3DragEvent } from 'd3';
import type MmpMap from '../map.js';

/**
 * A protected branch refuses local edits and announces the refusal with
 * `nodeProtected`. Remote writes, which arrive with notifyWithEvent false,
 * still apply.
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
    const { nodes } = makeMap();

    nodes.protectBranch('root');

    expect(nodes.record('root')?.protected).toBe(true);
    expect(nodes.record('a')?.protected).toBe(false);
    expect(nodes.protectingNode('b')).toBe('root');
  });

  it('announces every protected attribute it writes', () => {
    const { nodes, events } = makeMap();

    nodes.protectBranch('root');

    const changed = emitted(events.emit, 'nodeUpdate').map(
      update =>
        (update as { nodeProperties: ExportNodeProperties }).nodeProperties.id
    );
    expect(changed).toEqual(['a', 'root']);
  });

  it('does nothing for a node already protected by an ancestor', () => {
    const { nodes } = makeMap();

    nodes.protectBranch('b');

    expect(nodes.record('b')?.protected).toBe(false);
    expect(nodes.record('a')?.protected).toBe(true);
  });
});

describe('releaseBranch', () => {
  it('releases the whole branch from a descendant', () => {
    const { nodes } = makeMap();

    nodes.releaseBranch('b');

    expect(nodes.record('a')?.protected).toBe(false);
    expect(nodes.protectingNode('b')).toBeNull();
  });
});

describe('local edits inside a protected branch', () => {
  it('refuses a rename and leaves the name unchanged', () => {
    const { nodes, events } = makeMap();

    nodes.updateNode('name', 'new', true, 'b');

    expect(nodes.record('b')?.name).toBe('');
    expect(refusals(events.emit)).toEqual(['b']);
  });

  it('refuses a style change', () => {
    const { nodes } = makeMap();

    nodes.updateNode('fontWeight', 'bold', true, 'a');

    expect(nodes.record('a')?.font.weight).toBe('normal');
  });

  it('lets toggleBranchVisibility hide the child nodes of a protected node', () => {
    const { nodes, events } = makeMap();
    nodes.selectNode('a');
    events.emit.mockClear();

    nodes.toggleBranchVisibility();

    expect(nodes.childNodesHidden('a')).toBe(true);
    expect(emitted(events.emit, 'viewStateChange')).toHaveLength(1);
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
    const { map, nodes, events } = makeMap();

    const added = nodes.addNodeUnlessProtected({}, true, 'b');

    expect(added).toBeNull();
    expect(map.export.asJSON()).toHaveLength(4);
    expect(refusals(events.emit)).toEqual(['b']);
  });

  it('adds a child to an unprotected node', () => {
    const { nodes } = makeMap();

    const added = nodes.addNodeUnlessProtected(
      { coordinates: { x: -400, y: 0 } },
      true,
      'c'
    );

    expect(added && nodes.record(added.id)?.parent).toBe('c');
  });

  it('refuses a cut and keeps the clipboard empty', () => {
    const { nodes, clipboard, events } = makeMap();

    expect(clipboard.cut('b')).toBe(false);
    expect(nodes.existNode('b')).toBe(true);
    expect(refusals(events.emit)).toEqual(['b']);
  });

  it('refuses pasting onto a protected node', () => {
    const { map, clipboard, events } = makeMap();
    clipboard.copy('c');

    clipboard.paste('b');

    expect(map.export.asJSON()).toHaveLength(4);
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
  it('applies a remote rename inside a protected branch', () => {
    const { nodes, events } = makeMap();

    nodes.updateNode('name', 'remote', false, 'b');

    expect(nodes.record('b')?.name).toBe('remote');
    expect(refusals(events.emit)).toEqual([]);
  });

  it('applies a remote removal of a protected node', () => {
    const { nodes } = makeMap();

    nodes.removeNode('a', false);

    expect(nodes.existNode('a')).toBe(false);
    expect(nodes.existNode('b')).toBe(false);
  });

  it('pastes a copy of a protected branch unprotected', () => {
    const { map, clipboard, events } = makeMap();
    clipboard.copy('a');

    clipboard.paste('c');

    const [pasted] = emitted(
      events.emit,
      'nodePaste'
    ) as ExportNodeProperties[][];
    expect(pasted).toHaveLength(2);
    expect(pasted.every(node => node.protected === false)).toBe(true);
    expect(map.export.asJSON()).toHaveLength(6);
  });
});

describe('drag', () => {
  it('leaves a protected node at its position', () => {
    const { map, nodes, events } = makeMap();

    drag(map, 'b', 50, 50);

    expect(nodes.record('b')?.coordinates).toEqual({ x: 400, y: 0 });
    expect(emitted(events.emit, 'nodeUpdate')).toHaveLength(0);
    expect(refusals(events.emit)).toEqual(['b']);
  });

  it('moves a protected child along with its unprotected parent', () => {
    const { map, nodes } = makeMap();
    nodes.releaseBranch('a');
    nodes.updateNode('protected', true, false, 'b');

    drag(map, 'a', 50, 10);

    expect(nodes.record('a')?.coordinates).toEqual({ x: 250, y: 10 });
    expect(nodes.record('b')?.coordinates).toEqual({ x: 450, y: 10 });
  });
});
