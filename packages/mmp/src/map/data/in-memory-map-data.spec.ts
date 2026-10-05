import InMemoryMapData from './in-memory-map-data.js';
import type { MapDataChange } from './map-data.js';
import { nodeRecord } from '../../test/stub-map.js';

/** root -> a -> b, root -> c. */
function makeData() {
  const data = new InMemoryMapData([
    nodeRecord({ id: 'root', isRoot: true }),
    nodeRecord({ id: 'a', parent: 'root' }),
    nodeRecord({ id: 'b', parent: 'a' }),
    nodeRecord({ id: 'c', parent: 'root' }),
  ]);
  const changes: MapDataChange[] = [];
  data.subscribe(change => changes.push(change));
  return { data, changes };
}

const ids = (data: InMemoryMapData) => data.nodes().map(node => node.id);

describe('InMemoryMapData', () => {
  it('reads the nodes in insertion order and finds the main root', () => {
    const { data } = makeData();

    expect(ids(data)).toEqual(['root', 'a', 'b', 'c']);
    expect(data.node('b')?.parent).toBe('a');
    expect(data.node('missing')).toBeUndefined();
    expect(data.mainRootId()).toBe('root');
  });

  it('reports no main root for a map without one', () => {
    expect(new InMemoryMapData().mainRootId()).toBeNull();
  });

  it('adds nodes and reports them as added', () => {
    const { data, changes } = makeData();

    data.addNodes([nodeRecord({ id: 'd', parent: 'c' })]);

    expect(ids(data)).toEqual(['root', 'a', 'b', 'c', 'd']);
    expect(changes).toEqual([
      { replaced: false, added: ['d'], updated: [], removed: [] },
    ]);
  });

  it('reports an overwritten node as updated', () => {
    const { data, changes } = makeData();

    data.addNodes([nodeRecord({ id: 'c', parent: 'root', name: 'C' })]);

    expect(data.node('c')?.name).toBe('C');
    expect(changes).toEqual([
      { replaced: false, added: [], updated: ['c'], removed: [] },
    ]);
  });

  it('writes a property through its path', () => {
    const { data, changes } = makeData();

    data.updateNode('a', 'backgroundColor', '#ff0000');
    data.updateNode('a', 'coordinates', { x: 5, y: 6 });

    expect(data.node('a')?.colors?.background).toBe('#ff0000');
    expect(data.node('a')?.coordinates).toEqual({ x: 5, y: 6 });
    expect(changes.map(change => change.updated)).toEqual([['a'], ['a']]);
  });

  it('leaves a record read earlier unchanged by a later write', () => {
    const { data } = makeData();
    const before = data.node('a');

    data.updateNode('a', 'name', 'A');

    expect(before?.name).toBe('');
    expect(data.node('a')?.name).toBe('A');
  });

  it('changes and announces nothing for an id it lacks', () => {
    const { data, changes } = makeData();

    data.updateNode('missing', 'name', 'x');
    data.removeNode('missing');

    expect(ids(data)).toEqual(['root', 'a', 'b', 'c']);
    expect(changes).toEqual([]);
  });

  it('removes a node with its descendants', () => {
    const { data, changes } = makeData();

    data.removeNode('a');

    expect(ids(data)).toEqual(['root', 'c']);
    expect(changes).toEqual([
      { replaced: false, added: [], updated: [], removed: ['a', 'b'] },
    ]);
  });

  it('reports a replacement, with the surviving ids as updated', () => {
    const { data, changes } = makeData();

    data.replaceMap([
      nodeRecord({ id: 'root', isRoot: true, name: 'New' }),
      nodeRecord({ id: 'c', parent: 'root' }),
      nodeRecord({ id: 'e', parent: 'root' }),
    ]);

    expect(ids(data)).toEqual(['root', 'c', 'e']);
    expect(changes).toHaveLength(1);
    expect(changes[0].replaced).toBe(true);
    expect(changes[0].added).toEqual(['e']);
    expect(changes[0].updated.sort()).toEqual(['c', 'root']);
    expect(changes[0].removed.sort()).toEqual(['a', 'b']);
  });

  it('notifies once per batch, with the outer batch ending last', () => {
    const { data, changes } = makeData();

    data.batch(() => {
      data.updateNode('a', 'name', 'A');
      data.batch(() => {
        data.addNodes([nodeRecord({ id: 'd', parent: 'c' })]);
        data.updateNode('d', 'name', 'D');
      });
      expect(changes).toHaveLength(0);
      data.removeNode('b');
    });

    expect(changes).toEqual([
      { replaced: false, added: ['d'], updated: ['a'], removed: ['b'] },
    ]);
  });

  it('reports nothing for a node added and removed in one batch', () => {
    const { data, changes } = makeData();

    data.batch(() => {
      data.addNodes([nodeRecord({ id: 'd', parent: 'c' })]);
      data.removeNode('d');
    });

    expect(changes).toEqual([]);
  });

  it('reports a node removed and added back in one batch as updated', () => {
    const { data, changes } = makeData();

    data.batch(() => {
      data.removeNode('c');
      data.addNodes([nodeRecord({ id: 'c', parent: 'root', name: 'C' })]);
    });

    expect(data.node('c')?.name).toBe('C');
    expect(changes).toEqual([
      { replaced: false, added: [], updated: ['c'], removed: [] },
    ]);
  });

  it('notifies for the writes before a batch throws', () => {
    const { data, changes } = makeData();

    expect(() =>
      data.batch(() => {
        data.updateNode('a', 'name', 'A');
        throw new Error('stop');
      })
    ).toThrow('stop');

    expect(changes.map(change => change.updated)).toEqual([['a']]);
  });

  it('keeps copies of the nodes it receives', () => {
    const node = nodeRecord({ id: 'root', isRoot: true });
    const data = new InMemoryMapData([node]);
    const value = { x: 1, y: 2 };

    node.name = 'changed';
    data.updateNode('root', 'coordinates', value);
    value.x = 99;

    expect(data.node('root')?.name).toBe('');
    expect(data.node('root')?.coordinates).toEqual({ x: 1, y: 2 });
  });

  it('stops notifying a listener that unsubscribed', () => {
    const data = new InMemoryMapData([nodeRecord({ id: 'root' })]);
    const listener = jest.fn();
    const unsubscribe = data.subscribe(listener);

    unsubscribe();
    data.updateNode('root', 'name', 'x');

    expect(listener).not.toHaveBeenCalled();
  });
});
