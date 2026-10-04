import { create } from '../../index.js';
import MmpMap from '../map.js';
import InMemoryMapData from '../data/in-memory-map-data.js';
import { stubSvgLengths } from '../../test/svg-lengths.js';
import type { MapSnapshot, OldMmpNode } from '@teammapper/shared';

/**
 * A map load replaces every node of the map data, and `exportAsJSON` reads
 * them back. These specs drive both through `MmpInstance`, as the frontend
 * does.
 */

beforeAll(stubSvgLengths);

function makeMap(data = new InMemoryMapData()): MmpMap {
  const ref = document.createElement('div');
  document.body.appendChild(ref);
  return create('map', ref, undefined, data);
}

function rootOf(map: MmpMap): string {
  const root = map.instance.exportRootProperties();
  if (!root) throw new Error('the map has no main root');
  return root.id;
}

/** A loaded map: the main root with a styled child and a grandchild. */
function makeLoadedMap(): {
  map: MmpMap;
  data: InMemoryMapData;
  child: string;
} {
  const data = new InMemoryMapData();
  const map = makeMap(data);
  map.instance.new();
  const child = map.instance.addNode(
    {
      name: 'child',
      colors: { background: '#ff0000' },
      font: { size: 18, weight: 'bold' },
    },
    true,
    rootOf(map)
  );
  if (!child) throw new Error('addNode added no child');
  map.instance.addNode({ name: 'grandchild' }, true, child.id);
  map.instance.updateNode('linkHref', 'https://example.com/', true, child.id);
  return { map, data, child: child.id };
}

/** Two nodes in the format mmp 0.1.7 exported. */
const LEGACY_MAP: OldMmpNode[] = [
  {
    key: 'node0',
    value: {
      name: 'Legacy root',
      x: 10,
      y: 20,
      k: 1,
      'background-color': '#ffffff',
      'text-color': '#000000',
    },
  },
  {
    key: 'node1',
    value: {
      parent: 'node0',
      name: 'Legacy child',
      x: 200,
      y: 50,
      k: 2,
      'background-color': '#eeeeee',
      'branch-color': '#ff0000',
      'text-color': '#333333',
      'font-size': '16',
      'image-size': '40',
      'image-src': '',
      bold: true,
      italic: true,
    },
  },
];

afterEach(() => {
  document.body.innerHTML = '';
});

describe('exportAsJSON', () => {
  it('returns no node for an empty map data', () => {
    expect(makeMap().instance.exportAsJSON()).toEqual([]);
  });

  it('returns the properties of every node in the order they were added', () => {
    const { map, child } = makeLoadedMap();
    const root = rootOf(map);

    expect(map.instance.exportAsJSON()).toMatchObject([
      { id: root, parent: '', isRoot: true, name: 'Root node' },
      {
        id: child,
        parent: root,
        isRoot: false,
        protected: false,
        name: 'child',
        colors: { background: '#ff0000' },
        font: { size: 18, weight: 'bold' },
        link: { href: 'https://example.com/' },
      },
      { parent: child, isRoot: false, name: 'grandchild' },
    ]);
  });

  it('returns plain JSON data', () => {
    const { map } = makeLoadedMap();
    const exported = map.instance.exportAsJSON();

    expect(exported).toStrictEqual(JSON.parse(JSON.stringify(exported)));
  });

  it('returns a copy the caller may change', () => {
    const { map, data, child } = makeLoadedMap();
    const before = JSON.stringify(map.instance.exportAsJSON());

    const exported = map.instance.exportAsJSON();
    exported.forEach(node => {
      node.name = 'changed';
      if (node.colors) node.colors.background = '#000000';
      if (node.coordinates) node.coordinates.x = 999;
    });
    exported.pop();

    expect(JSON.stringify(map.instance.exportAsJSON())).toBe(before);
    expect(data.node(child)?.name).toBe('child');
  });

  it('includes a peer write to the map data', () => {
    const { map, data, child } = makeLoadedMap();

    data.updateNode(child, 'name', 'Remote');

    const node = map.instance.exportAsJSON().find(n => n.id === child);
    expect(node?.name).toBe('Remote');
  });

  it('includes nodes added and leaves out nodes removed', () => {
    const { map, child } = makeLoadedMap();
    const added = map.instance.addNode({ name: 'added' }, true, rootOf(map));
    if (!added) throw new Error('addNode added no node');

    map.instance.removeNode(child);

    expect(map.instance.exportAsJSON().map(n => n.name)).toEqual([
      'Root node',
      'added',
    ]);
  });
});

describe('new', () => {
  it('loads an exported map unchanged', () => {
    const { map } = makeLoadedMap();
    const exported = map.instance.exportAsJSON();

    const target = makeMap();
    target.instance.new(exported);

    expect(target.instance.exportAsJSON()).toStrictEqual(exported);
  });

  it('writes one replacement to the map data', () => {
    const { map, data } = makeLoadedMap();
    const listener = jest.fn();
    data.subscribe(listener);

    map.instance.new(LEGACY_MAP as unknown as MapSnapshot);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].replaced).toBe(true);
  });

  it('converts a map in the legacy format', () => {
    const map = makeMap();

    map.instance.new(LEGACY_MAP as unknown as MapSnapshot);

    expect(map.instance.exportAsJSON()).toMatchObject([
      {
        id: 'map_node_0',
        parent: '',
        isRoot: true,
        k: 1,
        name: 'Legacy root',
        coordinates: { x: 10, y: 20 },
        image: { size: 0, src: '' },
        colors: { background: '#ffffff', branch: '', name: '#000000' },
        font: { size: 12, weight: 'normal', style: 'normal' },
      },
      {
        id: 'map_node_1',
        parent: 'map_node_0',
        isRoot: false,
        k: 2,
        name: 'Legacy child',
        coordinates: { x: 200, y: 50 },
        image: { size: 40, src: '' },
        colors: { background: '#eeeeee', branch: '#ff0000', name: '#333333' },
        font: { size: 16, weight: 'bold', style: 'italic' },
      },
    ]);
  });

  it('gives a node without a k a random one', () => {
    const map = makeMap();
    const nodes: OldMmpNode[] = JSON.parse(JSON.stringify(LEGACY_MAP));
    nodes[0].value.k = 0;

    map.instance.new(nodes as unknown as MapSnapshot);

    expect(map.instance.exportAsJSON()[0].k).not.toBe(0);
  });

  it('keeps only the fields a node has', () => {
    const { map, child } = makeLoadedMap();
    const legacy = map.instance
      .exportAsJSON()
      .map(node => ({ ...node, hidden: true, hasHiddenChildNodes: true }));
    const data = new InMemoryMapData();

    const target = makeMap(data);
    target.instance.new(legacy);

    const stored = data.nodes();
    expect(stored.every(node => !('hidden' in node))).toBe(true);
    expect(stored.every(node => !('hasHiddenChildNodes' in node))).toBe(true);
    const group = target.dom.g
      .selectAll<SVGGElement, string>('g.node')
      .filter(id => id === child)
      .node();
    expect(group?.style.visibility).toBe('visible');
  });

  it('refuses a map that is not a list of nodes and keeps the current map', () => {
    const { map, data } = makeLoadedMap();
    const before = map.instance.exportAsJSON();
    const listener = jest.fn();
    data.subscribe(listener);

    expect(() =>
      map.instance.new({ id: 'x' } as unknown as MapSnapshot)
    ).toThrow('The snapshot is not correct');
    expect(map.instance.exportAsJSON()).toStrictEqual(before);
    expect(listener).not.toHaveBeenCalled();
  });

  describe('with an empty node list', () => {
    it('keeps the current map and writes nothing', () => {
      const { map, data } = makeLoadedMap();
      const before = map.instance.exportAsJSON();
      const listener = jest.fn();
      data.subscribe(listener);

      expect(() => map.instance.new([])).toThrow(
        'There was an error importing the map; changes have been rolled back.'
      );
      expect(map.instance.exportAsJSON()).toStrictEqual(before);
      expect(map.instance.getSelectedNode()?.id).toBe(before[0].id);
      expect(listener).not.toHaveBeenCalled();
    });
  });
});
