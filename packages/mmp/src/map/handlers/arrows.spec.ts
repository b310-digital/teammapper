import type { MapArrow, MapSnapshot } from '@teammapper/shared';
import { emitted, nodeRecord, stubMap } from '../../test/stub-map.js';

/**
 * An arrow connects two nodes without changing the tree. mmp creates one from
 * the selected node or in arrow mode, selects and removes it, and keeps
 * arrows in line with node removal, copy and paste.
 */

const COLORS = { background: '#ffffff' };

/**
 * root -> a -> a1, a -> a2, root -> b, and a second tree `other` -> o1.
 * Nothing is selected.
 */
function makeMap(arrows: MapArrow[] = [], extra: MapSnapshot = []) {
  const stub = stubMap([
    nodeRecord({ id: 'root', isRoot: true, colors: COLORS }),
    nodeRecord({
      id: 'a',
      parent: 'root',
      coordinates: { x: 200, y: 0 },
      colors: COLORS,
    }),
    nodeRecord({
      id: 'a1',
      parent: 'a',
      coordinates: { x: 400, y: -40 },
      colors: COLORS,
    }),
    nodeRecord({
      id: 'a2',
      parent: 'a',
      coordinates: { x: 400, y: 40 },
      colors: COLORS,
    }),
    nodeRecord({
      id: 'b',
      parent: 'root',
      coordinates: { x: -200, y: 0 },
      colors: COLORS,
    }),
    nodeRecord({ id: 'other', coordinates: { x: 0, y: 400 }, colors: COLORS }),
    nodeRecord({
      id: 'o1',
      parent: 'other',
      coordinates: { x: 200, y: 400 },
      colors: COLORS,
    }),
    ...extra,
  ]);
  stub.data.addArrows(arrows);
  stub.nodes.deselectNode();
  stub.events.emit.mockClear();

  return { ...stub, arrows: stub.map.arrows };
}

/** Like makeMap, with writes refused as on a read-only client. */
function makeReadOnlyMap(arrows: MapArrow[] = []) {
  const stub = makeMap(arrows);
  (stub.options as { edit?: boolean }).edit = false;
  return stub;
}

describe('addArrow', () => {
  it('adds an arrow from the selected node to the target', () => {
    const { arrows, nodes, data } = makeMap();
    nodes.selectNode('a1');

    expect(arrows.addArrow('b')).toBeNull();
    expect(data.arrows()).toEqual([{ source: 'a1', target: 'b' }]);
  });

  it('adds an arrow from a named source', () => {
    const { arrows, data } = makeMap();

    arrows.addArrow('b', 'a1');

    expect(data.arrows()).toEqual([{ source: 'a1', target: 'b' }]);
  });

  it('leaves the parents of both nodes unchanged', () => {
    const { arrows, data } = makeMap();

    arrows.addArrow('b', 'a1');

    expect(data.node('a1')?.parent).toBe('a');
    expect(data.node('b')?.parent).toBe('root');
  });

  // canConnect in @teammapper/shared owns the endpoint rules. These two tests
  // prove that addArrow checks against the map's nodes and its arrows.
  it('refuses an arrow the nodes rule out and writes nothing', () => {
    const { arrows, data } = makeMap();

    expect(arrows.addArrow('a', 'a')).toBe('self');
    expect(data.arrows()).toEqual([]);
  });

  it('refuses a second arrow with the same source and target', () => {
    const { arrows, data } = makeMap([{ source: 'a1', target: 'b' }]);

    expect(arrows.addArrow('b', 'a1')).toBe('duplicate');
    expect(data.arrows()).toHaveLength(1);
  });

  it('throws without a source', () => {
    const { arrows } = makeMap();

    expect(() => arrows.addArrow('b')).toThrow();
  });

  it('lists every arrow as a copy', () => {
    const { arrows, data } = makeMap([{ source: 'a1', target: 'b' }]);

    const listed = arrows.getArrows();
    listed[0].target = 'changed';

    expect(data.arrows()).toEqual([{ source: 'a1', target: 'b' }]);
  });
});

describe('selecting an arrow', () => {
  it('selects the arrow and leaves no node selected', () => {
    const { arrows, nodes, events } = makeMap([{ source: 'a1', target: 'b' }]);
    nodes.selectNode('a');
    events.emit.mockClear();

    arrows.selectArrow('a1:b');

    expect(arrows.getSelectedArrow()).toEqual({ source: 'a1', target: 'b' });
    expect(nodes.getSelectedNode()).toBeNull();
    expect(emitted(events.emit, 'nodeDeselect')).toHaveLength(1);
    expect(emitted(events.emit, 'arrowSelect')).toEqual([
      { source: 'a1', target: 'b' },
    ]);
  });

  it('draws the arrow as selected', () => {
    const { arrows, draw } = makeMap([{ source: 'a1', target: 'b' }]);

    arrows.selectArrow('a1:b');

    expect(draw.setArrowSelected).toHaveBeenLastCalledWith('a1:b');
  });

  it('clears the arrow selection when a node takes the selection', () => {
    const { arrows, nodes, events, draw } = makeMap([
      { source: 'a1', target: 'b' },
    ]);
    arrows.selectArrow('a1:b');
    events.emit.mockClear();

    nodes.selectNode('a');

    expect(arrows.getSelectedArrow()).toBeNull();
    expect(emitted(events.emit, 'arrowDeselect')).toEqual([
      { source: 'a1', target: 'b' },
    ]);
    expect(draw.setArrowSelected).toHaveBeenLastCalledWith(null);
  });

  it('clears the selection on deselectArrow', () => {
    const { arrows } = makeMap([{ source: 'a1', target: 'b' }]);
    arrows.selectArrow('a1:b');

    arrows.deselectArrow();

    expect(arrows.getSelectedArrow()).toBeNull();
  });

  it('ignores a key the map does not hold', () => {
    const { arrows, events } = makeMap();

    arrows.selectArrow('a1:b');

    expect(arrows.getSelectedArrow()).toBeNull();
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('selects nothing on a read-only map', () => {
    const { arrows } = makeReadOnlyMap([{ source: 'a1', target: 'b' }]);

    arrows.selectArrow('a1:b');

    expect(arrows.getSelectedArrow()).toBeNull();
  });

  it('clears the selection when a peer removes the arrow', () => {
    const { arrows, data } = makeMap([{ source: 'a1', target: 'b' }]);
    arrows.selectArrow('a1:b');

    data.removeArrow('a1:b');

    expect(arrows.getSelectedArrow()).toBeNull();
  });

  it('clears the selection when a peer moves an endpoint below hidden child nodes', () => {
    const { arrows, data, map } = makeMap([{ source: 'a1', target: 'b' }]);
    arrows.selectArrow('a1:b');
    map.viewState.toggle('a2');

    data.addNodes([
      nodeRecord({ id: 'b', parent: 'a2', coordinates: { x: 600, y: 40 } }),
    ]);

    expect(arrows.getSelectedArrow()).toBeNull();
  });

  it('clears the selection when a peer removes an endpoint', () => {
    const { arrows, data } = makeMap([{ source: 'a1', target: 'b' }]);
    arrows.selectArrow('a1:b');

    data.removeNode('b');

    expect(arrows.getSelectedArrow()).toBeNull();
  });
});

describe('removeArrow', () => {
  it('removes the selected arrow and keeps both nodes', () => {
    const { arrows, data } = makeMap([{ source: 'a1', target: 'b' }]);
    arrows.selectArrow('a1:b');

    arrows.removeArrow();

    expect(data.arrows()).toEqual([]);
    expect(data.nodes()).toHaveLength(7);
    expect(arrows.getSelectedArrow()).toBeNull();
  });

  it('removes the arrow with the key', () => {
    const { arrows, data } = makeMap([
      { source: 'a1', target: 'b' },
      { source: 'b', target: 'a1' },
    ]);

    arrows.removeArrow('b:a1');

    expect(data.arrows()).toEqual([{ source: 'a1', target: 'b' }]);
  });

  it('removes nothing without a key and without a selected arrow', () => {
    const { arrows, data } = makeMap([{ source: 'a1', target: 'b' }]);

    arrows.removeArrow();

    expect(data.arrows()).toHaveLength(1);
  });
});

describe('arrow mode', () => {
  function inArrowMode(source = 'a1', arrows: MapArrow[] = []) {
    const stub = makeMap(arrows);
    stub.nodes.selectNode(source);
    stub.arrows.startArrowMode();
    stub.events.emit.mockClear();
    return stub;
  }

  it('starts from the selected node', () => {
    const { arrows, nodes, events, draw } = makeMap();
    nodes.selectNode('a1');

    expect(arrows.startArrowMode()).toBe(true);
    expect(arrows.isArrowMode()).toBe(true);
    expect(emitted(events.emit, 'arrowMode')).toEqual([true]);
    expect(draw.showArrowPreview).toHaveBeenLastCalledWith('a1');
  });

  it('does not start with no node selected', () => {
    const { arrows } = makeMap();

    expect(arrows.startArrowMode()).toBe(false);
    expect(arrows.isArrowMode()).toBe(false);
  });

  it('does not start on a read-only map', () => {
    const { arrows, nodes } = makeReadOnlyMap();
    nodes.selectNode('a1');

    expect(arrows.startArrowMode()).toBe(false);
  });

  it('marks every node the source may not connect to', () => {
    const { draw } = inArrowMode('a', [{ source: 'a', target: 'b' }]);

    const calls = draw.markRefused.mock.calls;
    const marked = calls[calls.length - 1][0] as string[];
    expect([...marked].sort()).toEqual(['a', 'a1', 'a2', 'b', 'root']);
  });

  it('creates the arrow on a click on an allowed node and ends with the source selected', () => {
    const { arrows, nodes, data, events, draw } = inArrowMode();

    expect(arrows.handleNodeClick('b')).toBe(true);

    expect(data.arrows()).toEqual([{ source: 'a1', target: 'b' }]);
    expect(arrows.isArrowMode()).toBe(false);
    expect(nodes.getSelectedNode()?.id).toBe('a1');
    expect(emitted(events.emit, 'arrowMode')).toEqual([false]);
    expect(draw.showArrowPreview).toHaveBeenLastCalledWith(null);
    expect(draw.markRefused).toHaveBeenLastCalledWith([]);
  });

  it('refuses the source itself, says why and stays on', () => {
    const { arrows, data, events } = inArrowMode();

    expect(arrows.handleNodeClick('a1')).toBe(true);

    expect(data.arrows()).toEqual([]);
    expect(arrows.isArrowMode()).toBe(true);
    expect(emitted(events.emit, 'arrowRefused')).toEqual(['self']);
  });

  it('refuses a duplicate and stays on', () => {
    const { arrows, events } = inArrowMode('a1', [
      { source: 'a1', target: 'b' },
    ]);

    arrows.handleNodeClick('b');

    expect(arrows.isArrowMode()).toBe(true);
    expect(emitted(events.emit, 'arrowRefused')).toEqual(['duplicate']);
  });

  it('leaves a node click alone outside arrow mode', () => {
    const { arrows } = makeMap();

    expect(arrows.handleNodeClick('b')).toBe(false);
  });

  it('ends without an arrow on stopArrowMode', () => {
    const { arrows, data, events } = inArrowMode();

    arrows.stopArrowMode();

    expect(arrows.isArrowMode()).toBe(false);
    expect(data.arrows()).toEqual([]);
    expect(emitted(events.emit, 'arrowMode')).toEqual([false]);
  });

  it('announces nothing on stopArrowMode outside arrow mode', () => {
    const { arrows, events } = makeMap();

    arrows.stopArrowMode();

    expect(events.emit).not.toHaveBeenCalled();
  });

  it('ends when a peer removes the source', () => {
    const { arrows, data } = inArrowMode('a1');

    data.removeNode('a');

    expect(arrows.isArrowMode()).toBe(false);
    expect(data.arrows()).toEqual([]);
  });

  it('ends when a peer moves the source below a node whose child nodes are hidden', () => {
    const { arrows, data, map } = inArrowMode('b');
    map.viewState.toggle('a');

    data.addNodes([
      nodeRecord({ id: 'b', parent: 'a', coordinates: { x: -200, y: 0 } }),
    ]);

    expect(arrows.isArrowMode()).toBe(false);
  });

  it('ends when the map is replaced', () => {
    const { arrows, data } = inArrowMode('a1');

    data.replaceMap([nodeRecord({ id: 'root', isRoot: true })]);

    expect(arrows.isArrowMode()).toBe(false);
  });

  it('ends when another node takes the selection', () => {
    const { arrows, nodes } = inArrowMode('a1');

    nodes.selectNode('b');

    expect(arrows.isArrowMode()).toBe(false);
  });

  it('stays on when a peer changes another node', () => {
    const { arrows, data } = inArrowMode('a1');

    data.updateNode('b', 'name', 'Peer');

    expect(arrows.isArrowMode()).toBe(true);
  });
});

describe('loading a map with arrows', () => {
  const NODES = [
    nodeRecord({ id: 'r', isRoot: true }),
    nodeRecord({ id: 'x', parent: 'r' }),
    nodeRecord({ id: 'y', parent: 'r' }),
  ];

  it('replaces the arrows with the loaded ones', () => {
    const { map, data } = makeMap([{ source: 'a1', target: 'b' }]);

    map.loader.load(NODES, [{ source: 'x', target: 'y' }]);

    expect(data.arrows()).toEqual([{ source: 'x', target: 'y' }]);
  });

  it('leaves no arrows when the load passes none', () => {
    const { map, data } = makeMap([{ source: 'a1', target: 'b' }]);

    map.loader.load(NODES);

    expect(data.arrows()).toEqual([]);
  });

  it('checks each arrow against the arrows loaded before it', () => {
    const { map, data } = makeMap();

    map.loader.load(NODES, [
      { source: 'x', target: 'y' },
      { source: 'x', target: 'y' },
    ]);

    expect(data.arrows()).toEqual([{ source: 'x', target: 'y' }]);
  });

  it.each([
    ['a number', 7],
    ['null', null],
    ['a missing target', { source: 'x' }],
    ['an empty source', { source: '', target: 'y' }],
  ])('leaves out an entry that is %s', (_label, entry) => {
    const { map, data } = makeMap();

    map.loader.load(NODES, [entry, { source: 'x', target: 'y' }]);

    expect(data.arrows()).toEqual([{ source: 'x', target: 'y' }]);
  });
});

describe('arrows and node removal', () => {
  it('removes the arrows of a removed node and of its descendants', () => {
    const { nodes, data } = makeMap([
      { source: 'b', target: 'a' },
      { source: 'a1', target: 'o1' },
      { source: 'b', target: 'o1' },
    ]);

    nodes.removeNode('a');

    expect(data.arrows()).toEqual([{ source: 'b', target: 'o1' }]);
  });

  it('removes the arrows of a deleted tree and keeps the main tree', () => {
    const { nodes, data } = makeMap([{ source: 'o1', target: 'b' }]);

    nodes.removeNode('other');

    expect(data.arrows()).toEqual([]);
    expect(data.node('b')).toBeDefined();
  });

  it('removes the arrows of a cut node', () => {
    const { map, data } = makeMap([{ source: 'a1', target: 'b' }]);

    map.copyPaste.cut('a');

    expect(data.arrows()).toEqual([]);
  });
});

describe('copy and paste with arrows', () => {
  /** The id of the pasted copy of the node named `name`. */
  function pastedId(
    data: ReturnType<typeof makeMap>['data'],
    name: string,
    original: string
  ): string {
    const found = data
      .nodes()
      .find(node => node.name === name && node.id !== original);
    if (!found) throw new Error('no pasted ' + name);
    return found.id;
  }

  function named(arrows: MapArrow[] = []) {
    return makeMap(arrows, []);
  }

  it('pastes the arrows inside the copied subtree between the pasted nodes', () => {
    const stub = named([{ source: 'a1', target: 'a2' }]);
    stub.data.updateNode('a1', 'name', 'A1');
    stub.data.updateNode('a2', 'name', 'A2');
    stub.map.copyPaste.copy('a');

    stub.map.copyPaste.paste('b');

    const a1 = pastedId(stub.data, 'A1', 'a1');
    const a2 = pastedId(stub.data, 'A2', 'a2');
    expect(stub.data.arrows()).toEqual([
      { source: 'a1', target: 'a2' },
      { source: a1, target: a2 },
    ]);
  });

  it('leaves the arrows with one endpoint outside the subtree behind', () => {
    const stub = named([{ source: 'a1', target: 'b' }]);
    stub.map.copyPaste.copy('a');

    stub.map.copyPaste.paste('b');

    expect(stub.data.arrows()).toEqual([{ source: 'a1', target: 'b' }]);
  });

  it('pastes the inner arrows of a tree pasted with nothing selected', () => {
    const stub = named([{ source: 'other', target: 'o1' }]);
    stub.data.addNodes([nodeRecord({ id: 'o2', parent: 'other' })]);
    stub.data.addArrows([{ source: 'o1', target: 'o2' }]);
    stub.data.updateNode('o1', 'name', 'O1');
    stub.data.updateNode('o2', 'name', 'O2');
    stub.map.copyPaste.copy('other');

    stub.map.copyPaste.pasteTree();

    const o1 = pastedId(stub.data, 'O1', 'o1');
    const o2 = pastedId(stub.data, 'O2', 'o2');
    expect(stub.data.arrows()).toContainEqual({ source: o1, target: o2 });
  });

  it('writes the pasted nodes and arrows in one change', () => {
    const stub = named([{ source: 'a1', target: 'a2' }]);
    stub.map.copyPaste.copy('a');
    const listener = jest.fn();
    stub.data.subscribe(listener);

    stub.map.copyPaste.paste('b');

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('pastes the inner arrows of a cut subtree', () => {
    const stub = named([{ source: 'a1', target: 'a2' }]);
    stub.map.copyPaste.cut('a');

    stub.map.copyPaste.paste('b');

    expect(stub.data.arrows()).toHaveLength(1);
  });
});
