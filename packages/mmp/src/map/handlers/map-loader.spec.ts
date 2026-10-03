import { create } from '../../index.js';
import MmpMap from '../map.js';
import type { MapSnapshot, OldMmpNode } from '@teammapper/shared';

/**
 * A map load replaces every node of the map, and `exportAsJSON` reads them
 * back. These specs drive both through `MmpInstance`, as the frontend does.
 */

function makeMap(): MmpMap {
  const ref = document.createElement('div');
  document.body.appendChild(ref);
  const map = create('map', ref);
  // jsdom lays nothing out; d3-zoom reads the extent from the view box.
  map.dom.svg.attr('viewBox', '0 0 800 600');
  return map;
}

/** A loaded map: the main root with a styled child and a grandchild. */
function makeLoadedMap(): { map: MmpMap; child: string } {
  const map = makeMap();
  map.instance.new();
  const child = map.instance.addNode({
    name: 'child',
    colors: { background: '#ff0000' },
    font: { size: 18, weight: 'bold' },
  });
  if (!child) throw new Error('addNode added no child');
  map.instance.addNode({ name: 'grandchild' }, true, child.id);
  map.instance.updateNode('linkHref', 'https://example.com/', true, child.id);
  return { map, child: child.id };
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
  it('returns no node before the first map load', () => {
    expect(makeMap().instance.exportAsJSON()).toEqual([]);
  });

  it('returns the properties of every node in the order they were added', () => {
    const { map, child } = makeLoadedMap();
    const root = map.instance.exportRootProperties().id;

    expect(map.instance.exportAsJSON()).toMatchObject([
      { id: root, parent: '', isRoot: true, name: 'Root node' },
      {
        id: child,
        parent: root,
        isRoot: false,
        hidden: false,
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
    const { map, child } = makeLoadedMap();
    const before = JSON.stringify(map.instance.exportAsJSON());

    const exported = map.instance.exportAsJSON();
    exported.forEach(node => {
      node.name = 'changed';
      if (node.colors) node.colors.background = '#000000';
      if (node.coordinates) node.coordinates.x = 999;
    });
    exported.pop();

    expect(JSON.stringify(map.instance.exportAsJSON())).toBe(before);
    expect(map.nodes.getNode(child)?.name).toBe('child');
  });

  it('includes a change applied without an event', () => {
    const { map, child } = makeLoadedMap();

    map.instance.updateNode('name', 'Remote', false, child);

    const node = map.instance.exportAsJSON().find(n => n.id === child);
    expect(node?.name).toBe('Remote');
  });

  it('includes nodes added and leaves out nodes removed', () => {
    const { map, child } = makeLoadedMap();
    const added = map.instance.addNode({ name: 'added' }, false);
    if (!added) throw new Error('addNode added no node');

    map.instance.removeNode(child, false);

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

  it('hands the previous map to create listeners', () => {
    const { map } = makeLoadedMap();
    const previous = map.instance.exportAsJSON();
    const payloads: (MapSnapshot | undefined)[] = [];
    map.instance.on('create', event => payloads.push(event.previousMapData));

    map.instance.new(LEGACY_MAP as unknown as MapSnapshot);

    expect(payloads).toEqual([previous]);
  });

  it('refuses a map that is not a list of nodes and keeps the current map', () => {
    const { map } = makeLoadedMap();
    const before = map.instance.exportAsJSON();
    const created = jest.fn();
    map.instance.on('create', created);

    expect(() =>
      map.instance.new({ id: 'x' } as unknown as MapSnapshot)
    ).toThrow('The snapshot is not correct');
    expect(map.instance.exportAsJSON()).toStrictEqual(before);
    expect(created).not.toHaveBeenCalled();
  });

  describe('with an empty node list', () => {
    it('keeps the current map and fires no create event', () => {
      const { map } = makeLoadedMap();
      const before = map.instance.exportAsJSON();
      const created = jest.fn();
      map.instance.on('create', created);

      expect(() => map.instance.new([])).toThrow(
        'There was an error importing the map; changes have been rolled back.'
      );
      expect(map.instance.exportAsJSON()).toStrictEqual(before);
      expect(map.nodes.getSelectedNode()?.id).toBe(before[0].id);
      expect(created).not.toHaveBeenCalled();
    });
  });
});
