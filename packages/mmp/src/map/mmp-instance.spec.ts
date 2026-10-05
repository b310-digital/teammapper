import * as d3 from 'd3';
import { create } from '../index.js';
import MmpMap from './map.js';
import InMemoryMapData from './data/in-memory-map-data.js';
import type { MapDataChange } from './data/map-data.js';
import { nodeRecord } from '../test/stub-map.js';
import { stubSvgLengths } from '../test/svg-lengths.js';
import type {
  ExportNodeProperties,
  MapSnapshot,
  MapViewState,
  MmpEventType,
  NodeProperty,
  NodeUpdateEvent,
  OldMmpNode,
} from '@teammapper/shared';

/**
 * Every event but `viewStateChange`. The `satisfies` clause fails the
 * typecheck when `MmpEventType` gains an event this record lacks.
 */
const OTHER_EVENTS = Object.keys({
  // Mirror compatibility, removed in PR 7: create to distribute.
  create: true,
  nodeSelect: true,
  nodeDeselect: true,
  nodeUpdate: true,
  nodeCreate: true,
  nodePaste: true,
  nodeRemove: true,
  distribute: true,
  nodeProtected: true,
  mapChange: true,
} satisfies Record<Exclude<MmpEventType, 'viewStateChange'>, true>) as Exclude<
  MmpEventType,
  'viewStateChange'
>[];

/**
 * The frontend reaches the library through `MmpInstance` alone, so these specs
 * drive a real map through it: every node property, the protection and the
 * events. Each map reads and writes an `InMemoryMapData`.
 */

const IMAGE_REFERENCE = 'image:5f0c4b1e-3a8d-4c6e-9f2a-7b1d2e3f4a5b';

beforeAll(stubSvgLengths);

function makeMapOver(data: InMemoryMapData): MmpMap {
  const ref = document.createElement('div');
  document.body.appendChild(ref);
  return create('map', ref, undefined, data);
}

function makeMap(): MmpMap {
  const map = makeMapOver(new InMemoryMapData());
  map.instance.new();
  return map;
}

/** The main root with one child, which the map selects. */
function makeMapWithChild() {
  const map = makeMap();
  const child = map.instance.addNode({ name: 'child' });
  if (!child) throw new Error('addNode added no child');
  map.instance.selectNode(child.id);
  return { map, child: child.id };
}

function rootOf(map: MmpMap): string {
  const root = map.instance.exportRootProperties();
  if (!root) throw new Error('the map has no main root');
  return root.id;
}

function exported(map: MmpMap, id: string): ExportNodeProperties {
  const node = map.instance.exportAsJSON().find(n => n.id === id);
  if (!node) throw new Error('no node ' + id);
  return node;
}

/** The drawn element bound to the node with the id. */
function drawnElement<E extends Element>(selector: string, id: string) {
  return d3
    .selectAll<E, string>(selector)
    .filter(datum => datum === id)
    .node();
}

function nodeDom(id: string): SVGGElement {
  const dom = drawnElement<SVGGElement>('g.node', id);
  if (!dom) throw new Error('no dom for ' + id);
  return dom;
}

function nameDom(id: string): HTMLDivElement {
  const div = nodeDom(id).querySelector('foreignObject > div');
  if (!(div instanceof HTMLDivElement)) throw new Error('no name for ' + id);
  return div;
}

function drawnIds(): string[] {
  return d3.selectAll<SVGGElement, string>('g.node').data();
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

afterEach(() => {
  document.body.innerHTML = '';
});

interface PropertyCase {
  property: NodeProperty;
  value: unknown;
  read: (node: ExportNodeProperties) => unknown;
  rendered?: (id: string) => unknown;
}

const PROPERTY_CASES: PropertyCase[] = [
  {
    property: 'name',
    value: 'Renamed',
    read: n => n.name,
    rendered: id => nameDom(id).innerHTML,
  },
  {
    property: 'coordinates',
    value: { x: 320, y: 140 },
    read: n => n.coordinates,
    rendered: id => nodeDom(id).getAttribute('transform'),
  },
  {
    property: 'imageSrc',
    value: IMAGE_REFERENCE,
    read: n => n.image?.src,
  },
  {
    property: 'linkHref',
    value: 'https://example.com/',
    read: n => n.link?.href,
    rendered: id => nodeDom(id).querySelector('a')?.getAttribute('href'),
  },
  {
    property: 'backgroundColor',
    value: '#ff0000',
    read: n => n.colors?.background,
    rendered: id => nodeDom(id).querySelector('path')?.style.fill,
  },
  {
    property: 'branchColor',
    value: '#00ff00',
    read: n => n.colors?.branch,
    rendered: id =>
      drawnElement<SVGPathElement>('path.branch', id)?.style.stroke,
  },
  {
    property: 'nameColor',
    value: '#0000ff',
    read: n => n.colors?.name,
    rendered: id => nameDom(id).style.color,
  },
  {
    property: 'fontWeight',
    value: 'bold',
    read: n => n.font?.weight,
    rendered: id => nameDom(id).style.fontWeight,
  },
  {
    property: 'fontStyle',
    value: 'italic',
    read: n => n.font?.style,
    rendered: id => nameDom(id).style.fontStyle,
  },
  {
    property: 'fontSize',
    value: 24,
    read: n => n.font?.size,
    rendered: id => nameDom(id).style.fontSize,
  },
  {
    property: 'protected',
    value: true,
    read: n => n.protected,
    rendered: id => nodeDom(id).querySelector('text.protected-icon') !== null,
  },
];

/** What the DOM shows once a property took its case value. */
const RENDERED: Partial<Record<NodeProperty, unknown>> = {
  name: 'Renamed',
  coordinates: 'translate(320,140)',
  linkHref: 'https://example.com/',
  backgroundColor: '#ff0000',
  branchColor: '#00ff00',
  nameColor: 'rgb(0, 0, 255)',
  fontWeight: 'bold',
  fontStyle: 'italic',
  fontSize: '24px',
  protected: true,
};

describe('updateNode', () => {
  describe.each(PROPERTY_CASES)('$property', ({ property, value, read }) => {
    it('writes the value to the map data', () => {
      const { map, child } = makeMapWithChild();

      map.instance.updateNode(property, value, true, child);

      expect(read(exported(map, child))).toEqual(value);
    });

    it('announces the change with mapChange', () => {
      const { map, child } = makeMapWithChild();
      const listener = jest.fn();
      map.instance.on('mapChange', listener);

      map.instance.updateNode(property, value, true, child);

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('writes nothing when the value stays the same', () => {
      const { map, child } = makeMapWithChild();
      map.instance.updateNode(property, value, true, child);
      const listener = jest.fn();
      map.instance.on('mapChange', listener);
      map.instance.on('nodeUpdate', listener);

      map.instance.updateNode(property, value, true, child);

      expect(listener).not.toHaveBeenCalled();
    });

    // Mirror compatibility, removed in PR 7, as are the specs below that
    // name `notifyWithEvent`, `addNodes` or an event other than
    // `nodeSelect`, `nodeDeselect`, `nodeProtected`, `viewStateChange` and
    // `mapChange`.
    it('announces a local change with the previous value', () => {
      const { map, child } = makeMapWithChild();
      const previousValue = read(exported(map, child));
      const updates: NodeUpdateEvent[] = [];
      map.instance.on('nodeUpdate', event => updates.push(event));

      map.instance.updateNode(property, value, true, child);

      expect(updates).toHaveLength(1);
      expect(updates[0].changedProperty).toBe(property);
      expect(updates[0].previousValue).toEqual(previousValue);
      expect(read(updates[0].nodeProperties)).toEqual(value);
    });

    it('announces nothing but mapChange without notifyWithEvent', () => {
      const { map, child } = makeMapWithChild();
      const update = jest.fn();
      const change = jest.fn();
      map.instance.on('nodeUpdate', update);
      map.instance.on('mapChange', change);

      map.instance.updateNode(property, value, false, child);

      expect(update).not.toHaveBeenCalled();
      expect(change).toHaveBeenCalledTimes(1);
      expect(read(exported(map, child))).toEqual(value);
    });
  });

  describe.each(PROPERTY_CASES.filter(c => c.rendered))(
    '$property',
    ({ property, value, rendered }) => {
      it('draws the value', () => {
        const { map, child } = makeMapWithChild();

        map.instance.updateNode(property, value, true, child);

        expect(rendered?.(child)).toEqual(RENDERED[property]);
      });
    }
  );

  it('sets the image size of a node with an image', () => {
    const { map, child } = makeMapWithChild();
    map.instance.updateNode('imageSrc', IMAGE_REFERENCE, true, child);

    map.instance.updateNode('imageSize', 40, true, child);

    expect(exported(map, child).image?.size).toBe(40);
  });

  it('refuses an image size on a node without an image', () => {
    const { map, child } = makeMapWithChild();

    expect(() =>
      map.instance.updateNode('imageSize', 40, true, child)
    ).toThrow();
  });

  it('targets the selected node without an id', () => {
    const { map, child } = makeMapWithChild();

    map.instance.updateNode('name', 'Selected');

    expect(exported(map, child).name).toBe('Selected');
  });

  it('refuses a branch color on a root node', () => {
    const map = makeMap();

    expect(() =>
      map.instance.updateNode('branchColor', '#00ff00', true, rootOf(map))
    ).toThrow();
  });

  it('refuses a property it does not know', () => {
    const { map, child } = makeMapWithChild();

    expect(() =>
      map.instance.updateNode('shadow', '1px', true, child)
    ).toThrow();
  });

  it.each<[NodeProperty, unknown]>([
    ['backgroundColor', 'red'],
    ['backgroundColor', 'expression(alert(1))'],
    ['nameColor', '#fff;background:url(x)'],
    ['branchColor', 42],
    ['linkHref', 'javascript:alert(1)'],
    ['fontSize', 'big'],
    ['fontWeight', 'x'.repeat(1000)],
    ['name', 42],
    ['protected', 1],
    ['coordinates', { x: 'left', y: 0 }],
  ])('refuses %s %p and keeps the map data', (property, value) => {
    const { map, child } = makeMapWithChild();
    const before = exported(map, child);

    expect(() =>
      map.instance.updateNode(property, value, false, child)
    ).toThrow();
    expect(exported(map, child)).toEqual(before);
  });

  it('clears a color, a link and an image with an empty value', () => {
    const { map, child } = makeMapWithChild();
    map.instance.updateNode('linkHref', 'https://example.com', true, child);
    map.instance.updateNode('imageSrc', IMAGE_REFERENCE, true, child);

    map.instance.updateNode('backgroundColor', '', true, child);
    map.instance.updateNode('linkHref', '', true, child);
    map.instance.updateNode('imageSrc', '', true, child);

    const node = exported(map, child);
    expect(node.colors?.background).toBe('');
    expect(node.link?.href).toBe('');
    expect(node.image?.src).toBe('');
  });

  it('writes a recolor and the recolor back', () => {
    const data = new InMemoryMapData();
    const map = makeMapOver(data);
    map.instance.new();
    const child = map.instance.addNode({ name: 'child' }, true, rootOf(map));
    if (!child) throw new Error('addNode added no child');
    const original = data.node(child.id)?.colors?.background;

    map.instance.updateNode('backgroundColor', '#ff0000', true, child.id);
    expect(data.node(child.id)?.colors?.background).toBe('#ff0000');

    map.instance.updateNode('backgroundColor', original, true, child.id);
    expect(data.node(child.id)?.colors?.background).toBe(original);
  });
});

describe('protection', () => {
  /** root -> parent -> child, with parent protected. */
  function makeProtectedMap() {
    const map = makeMap();
    const parent = map.instance.addNode({ name: 'parent' });
    if (!parent) throw new Error('addNode added no parent');
    const child = map.instance.addNode({ name: 'child' }, true, parent.id);
    if (!child) throw new Error('addNode added no child');
    map.instance.protectBranch(parent.id);
    return { map, parent: parent.id, child: child.id };
  }

  it.each(PROPERTY_CASES.filter(c => c.property !== 'protected'))(
    'refuses a local $property change below it',
    ({ property, value, read }) => {
      const { map, child } = makeProtectedMap();
      const before = read(exported(map, child));
      const refused: ExportNodeProperties[] = [];
      map.instance.on('nodeProtected', node => refused.push(node));

      map.instance.updateNode(property, value, true, child);

      expect(read(exported(map, child))).toEqual(before);
      expect(refused.map(node => node.id)).toEqual([child]);
    }
  );

  it('applies a remote change and a remote removal below it', () => {
    const { map, parent, child } = makeProtectedMap();
    const refused = jest.fn();
    const announced = jest.fn();
    map.instance.on('nodeProtected', refused);
    map.instance.on('nodeUpdate', announced);
    map.instance.on('nodeRemove', announced);

    map.instance.updateNode('name', 'Remote', false, child);
    expect(exported(map, child).name).toBe('Remote');
    map.instance.removeNode(parent, false);

    expect(map.instance.existNode(parent)).toBe(false);
    expect(refused).not.toHaveBeenCalled();
    expect(announced).not.toHaveBeenCalled();
  });

  it('refuses a local child and a local removal', () => {
    const { map, parent, child } = makeProtectedMap();
    const refused = jest.fn();
    map.instance.on('nodeProtected', refused);

    expect(map.instance.addNode({ name: 'x' }, true, parent)).toBeNull();
    map.instance.removeNode(child);

    expect(map.instance.existNode(child)).toBe(true);
    expect(map.instance.nodeChildren(parent)).toHaveLength(1);
    expect(refused).toHaveBeenCalledTimes(2);
  });

  it('names the protecting node and releases the branch', () => {
    const { map, parent, child } = makeProtectedMap();

    expect(map.instance.protectingNode(child)).toBe(parent);
    map.instance.releaseBranch(child);

    expect(map.instance.protectingNode(child)).toBeNull();
  });
});

describe('events', () => {
  it('announces a selection and the deselect a removal causes', () => {
    const map = makeMap();
    const selected: string[] = [];
    const deselected: string[] = [];
    const changes = jest.fn();
    map.instance.on('nodeSelect', node => selected.push(node.id));
    map.instance.on('nodeDeselect', node => deselected.push(node.id));
    map.instance.on('mapChange', changes);
    const root = rootOf(map);

    const node = map.instance.addNode({ name: 'a' });
    if (!node) throw new Error('addNode added no node');
    map.instance.updateNode('backgroundColor', '#ff0000', true, node.id);
    map.instance.selectNode(node.id);
    map.instance.removeNode(node.id);

    expect(selected).toEqual([node.id]);
    expect(deselected).toEqual([root, node.id]);
    expect(changes).toHaveBeenCalledTimes(3);
  });

  it('announces a new node and its removal', () => {
    const map = makeMap();
    const created: string[] = [];
    const removed: string[] = [];
    map.instance.on('nodeCreate', node => created.push(node.id));
    map.instance.on('nodeRemove', node => removed.push(node.id));

    const node = map.instance.addNode({ name: 'a' });
    if (!node) throw new Error('addNode added no node');
    map.instance.removeNode(node.id);

    expect(created).toEqual([node.id]);
    expect(removed).toEqual([node.id]);
  });

  it('hands the previous map to create listeners', () => {
    const map = makeMap();
    const previous = map.instance.exportAsJSON();
    const payloads: (MapSnapshot | undefined)[] = [];
    map.instance.on('create', event => payloads.push(event.previousMapData));

    map.instance.new(map.instance.exportAsJSON());
    map.instance.new(map.instance.exportAsJSON(), false);

    expect(payloads).toEqual([previous]);
  });

  it('announces a distribute without a payload', () => {
    const { map } = makeMapWithChild();
    const listener = jest.fn();
    map.instance.on('distribute', listener);

    map.instance.distributeNodes();
    map.instance.distributeNodes(false);

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('draws the nodes addNodes writes, without an event', () => {
    const map = makeMap();
    const root = rootOf(map);
    const announced = jest.fn();
    map.instance.on('nodeCreate', announced);

    map.instance.addNodes([
      nodeRecord({ id: 'peer', parent: root, k: 3, protected: true }),
    ]);

    expect(drawnIds()).toEqual([root, 'peer']);
    expect(exported(map, 'peer')).toMatchObject({ k: 3, protected: true });
    expect(announced).not.toHaveBeenCalled();
  });

  it('announces the view state alone when it hides child nodes', () => {
    const { map, child } = makeMapWithChild();
    const root = rootOf(map);
    map.instance.selectNode(root);
    const viewStates: MapViewState[] = [];
    const shared = jest.fn();
    OTHER_EVENTS.forEach(event => map.instance.on(event, shared));
    map.instance.on('viewStateChange', state => viewStates.push(state));

    map.instance.toggleBranchVisibility();

    expect(viewStates).toEqual([{ nodesWithHiddenChildren: [root] }]);
    expect(map.instance.exportViewState()).toEqual(viewStates[0]);
    expect(map.instance.childNodesHidden()).toBe(true);
    expect(map.instance.childNodesHidden(child)).toBe(false);
    expect(nodeDom(child).style.visibility).toBe('hidden');
    expect(shared).not.toHaveBeenCalled();
  });

  it('refuses an event it does not know', () => {
    const map = makeMap();

    expect(() =>
      map.instance.on('nodeHover' as 'nodeSelect', jest.fn())
    ).toThrow();
  });
});

describe('create', () => {
  /** root -> a -> b, root -> c. */
  const SNAPSHOT: MapSnapshot = [
    nodeRecord({ id: 'root', isRoot: true, name: 'Root' }),
    nodeRecord({ id: 'a', parent: 'root', coordinates: { x: 200, y: 0 } }),
    nodeRecord({ id: 'b', parent: 'a', coordinates: { x: 400, y: 0 } }),
    nodeRecord({ id: 'c', parent: 'root', coordinates: { x: -200, y: 0 } }),
  ];

  it('draws every node of a filled map data and selects the main root', () => {
    const map = makeMapOver(new InMemoryMapData(SNAPSHOT));

    expect(drawnIds()).toEqual(['root', 'a', 'b', 'c']);
    expect(d3.selectAll('path.branch').size()).toBe(3);
    expect(map.instance.getSelectedNode()?.id).toBe('root');
  });

  it('draws nothing and selects nothing for an empty map data', () => {
    const map = makeMapOver(new InMemoryMapData());

    expect(drawnIds()).toEqual([]);
    expect(map.instance.getSelectedNode()).toBeNull();
    expect(map.instance.exportRootProperties()).toBeNull();
  });
});

describe('changes written to the map data', () => {
  function makePeerMap() {
    const data = new InMemoryMapData([
      nodeRecord({ id: 'root', isRoot: true, name: 'Root' }),
      nodeRecord({ id: 'a', parent: 'root', coordinates: { x: 200, y: 0 } }),
      nodeRecord({ id: 'b', parent: 'a', coordinates: { x: 400, y: 0 } }),
    ]);
    const map = makeMapOver(data);
    return { data, map };
  }

  it('draws a peer write and keeps the selection', () => {
    const { data, map } = makePeerMap();
    map.instance.selectNode('a');
    const deselect = jest.fn();
    map.instance.on('nodeDeselect', deselect);

    data.addNodes([
      nodeRecord({ id: 'd', parent: 'a', coordinates: { x: 400, y: 80 } }),
    ]);
    data.updateNode('b', 'name', 'Peer');

    expect(drawnIds()).toContain('d');
    expect(nameDom('b').innerHTML).toBe('Peer');
    expect(map.instance.getSelectedNode()?.id).toBe('a');
    expect(deselect).not.toHaveBeenCalled();
  });

  it('deselects a selected node a peer removes', () => {
    const { data, map } = makePeerMap();
    map.instance.selectNode('b');
    const deselected: string[] = [];
    map.instance.on('nodeDeselect', node => deselected.push(node.id));

    data.removeNode('a');

    expect(deselected).toEqual(['b']);
    expect(map.instance.getSelectedNode()).toBeNull();
    expect(drawnIds()).toEqual(['root']);
    expect(d3.selectAll('path.branch').size()).toBe(0);
  });

  it('selects the main root of a replaced map', () => {
    const { data, map } = makePeerMap();
    map.instance.selectNode('b');
    const deselect = jest.fn();
    map.instance.on('nodeDeselect', deselect);

    data.replaceMap([
      nodeRecord({ id: 'other', isRoot: true, name: 'Other' }),
      nodeRecord({ id: 'x', parent: 'other' }),
    ]);

    expect(drawnIds()).toEqual(['other', 'x']);
    expect(map.instance.getSelectedNode()?.id).toBe('other');
    expect(deselect).not.toHaveBeenCalled();
  });

  it('keeps the selection and the view when a peer renames the main root', () => {
    const { data, map } = makePeerMap();
    map.instance.selectNode('a');
    const svg = map.dom.svg.node();
    if (!svg) throw new Error('no svg');
    map.dom.svg.call(map.zoom.getZoomBehavior().translateTo, 300, 200);
    const transform = d3.zoomTransform(svg).toString();
    const changes: MapDataChange[] = [];
    data.subscribe(change => changes.push(change));

    data.updateNode('root', 'name', 'Renamed');

    expect(changes[0].replaced).toBe(false);
    expect(nameDom('root').innerHTML).toBe('Renamed');
    expect(map.instance.getSelectedNode()?.id).toBe('a');
    expect(d3.zoomTransform(svg).toString()).toBe(transform);
  });

  it('draws a recolor reading the records of that node and its ancestors only', () => {
    const siblings = Array.from({ length: 20 }, (_, i) =>
      nodeRecord({ id: 's' + i, parent: 'root', coordinates: { x: 200, y: i } })
    );
    const data = new InMemoryMapData([
      nodeRecord({ id: 'root', isRoot: true }),
      nodeRecord({ id: 'a', parent: 'root', coordinates: { x: 200, y: 0 } }),
      ...siblings,
    ]);
    makeMapOver(data);
    const read = jest.spyOn(data, 'node');
    const scan = jest.spyOn(data, 'nodes');

    data.updateNode('a', 'backgroundColor', '#ff0000');

    expect(scan).not.toHaveBeenCalled();
    expect(new Set(read.mock.calls.map(([id]) => id))).toEqual(
      new Set(['a', 'root'])
    );
    expect(read.mock.calls.length).toBeLessThanOrEqual(4);
  });
});

describe('returned nodes', () => {
  it('leaves the map data unchanged when the caller changes a copy', () => {
    const { map, child } = makeMapWithChild();
    const before = exported(map, child);

    const copies = [
      map.instance.selectNode(),
      map.instance.getSelectedNode(),
      map.instance.exportRootProperties(),
      ...map.instance.nodeChildren(rootOf(map)),
      ...map.instance.exportAsJSON(),
    ];
    for (const copy of copies) {
      if (!copy) continue;
      copy.name = 'changed';
      if (copy.coordinates) copy.coordinates.x = 999;
      if (copy.colors) copy.colors.background = '#000000';
    }

    expect(exported(map, child)).toEqual(before);
    expect(exported(map, rootOf(map)).name).not.toBe('changed');
  });
});

describe('editing a name', () => {
  it('commits the name of A when B takes the selection', () => {
    const { map, child } = makeMapWithChild();
    const root = rootOf(map);
    map.instance.editNode();
    nameDom(child).innerHTML = 'Typed';

    map.instance.selectNode(root);

    expect(exported(map, child).name).toBe('Typed');
    expect(map.instance.getSelectedNode()?.id).toBe(root);
  });
});

describe('batched writes', () => {
  function countChanges(data: InMemoryMapData) {
    const listener = jest.fn();
    data.subscribe(listener);
    return listener;
  }

  function makeTree() {
    const data = new InMemoryMapData([
      nodeRecord({ id: 'root', isRoot: true }),
      nodeRecord({
        id: 'a',
        parent: 'root',
        coordinates: { x: 200, y: 0 },
        protected: true,
      }),
      // Off the layout, so distribute moves it.
      nodeRecord({ id: 'b', parent: 'a', coordinates: { x: 999, y: 999 } }),
      nodeRecord({ id: 'c', parent: 'root', coordinates: { x: -200, y: 0 } }),
    ]);
    return { data, map: makeMapOver(data) };
  }

  it('protects a branch in one change', () => {
    const { data, map } = makeTree();
    const listener = countChanges(data);

    map.instance.protectBranch('root');

    expect(listener).toHaveBeenCalledTimes(1);
    expect(data.node('root')?.protected).toBe(true);
    expect(data.node('a')?.protected).toBe(false);
  });

  it('distributes the nodes in one change', () => {
    const { data, map } = makeTree();
    const listener = countChanges(data);

    map.instance.distributeNodes();

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('pastes a branch in one change', () => {
    const { data, map } = makeTree();
    map.instance.copyNode('a');
    const listener = countChanges(data);

    map.instance.pasteNode('c');

    expect(listener).toHaveBeenCalledTimes(1);
    expect(data.nodes()).toHaveLength(6);
  });

  it('announces the pasted nodes in one nodePaste event', () => {
    const { data, map } = makeTree();
    map.instance.copyNode('a');
    const pastes: ExportNodeProperties[][] = [];
    map.instance.on('nodePaste', nodes => pastes.push(nodes));

    map.instance.pasteNode('c');

    const pastedIds = data
      .nodes()
      .slice(4)
      .map(node => node.id);
    expect(pastes.map(nodes => nodes.map(node => node.id))).toEqual([
      pastedIds,
    ]);
  });
});

describe('destroy', () => {
  it('removes the svg, every subscription and the resize listener', () => {
    const data = new InMemoryMapData();
    const map = makeMapOver(data);
    map.instance.new();
    const ref = map.dom.container.node();
    const listener = jest.fn();
    map.instance.on('nodeSelect', listener);
    const onChange = jest.spyOn(map.nodes, 'drawReplaced');

    map.instance.destroy();
    data.replaceMap([nodeRecord({ id: 'root', isRoot: true })]);

    expect(ref?.querySelector('svg')).toBeNull();
    expect(d3.select(window).on('resize.map')).toBeUndefined();
    expect(onChange).not.toHaveBeenCalled();
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('new with nodes', () => {
  it('keeps the view state and leaves the passed nodes unchanged', () => {
    const { map, child } = makeMapWithChild();
    const root = rootOf(map);
    map.instance.selectNode(root);
    map.instance.toggleBranchVisibility();
    const nodes = map.instance.exportAsJSON();
    const copy = JSON.parse(JSON.stringify(nodes));

    map.instance.new(deepFreeze(nodes));

    expect(nodes).toEqual(copy);
    expect(map.instance.exportViewState()).toEqual({
      nodesWithHiddenChildren: [root],
    });
    expect(nodeDom(child).style.visibility).toBe('hidden');
  });

  it('exports nodes without view state', () => {
    const { map } = makeMapWithChild();
    map.instance.selectNode(rootOf(map));
    map.instance.toggleBranchVisibility();

    for (const node of map.instance.exportAsJSON()) {
      expect(node).not.toHaveProperty('hidden');
      expect(node).not.toHaveProperty('hasHiddenChildNodes');
    }
  });

  it('leaves a legacy map unchanged', () => {
    const map = makeMap();
    const legacy: OldMmpNode[] = [
      {
        key: 'node0',
        value: {
          name: 'Legacy',
          x: 0,
          y: 0,
          k: 1,
          'background-color': '#ffffff',
          'text-color': '#000000',
        },
      },
    ];
    const copy = JSON.parse(JSON.stringify(legacy));

    map.instance.new(deepFreeze(legacy) as unknown as MapSnapshot);

    expect(legacy).toEqual(copy);
    expect(map.instance.exportAsJSON().map(n => n.name)).toEqual(['Legacy']);
  });

  it('refuses a map whose node carries an invalid color', () => {
    const map = makeMap();
    const nodes = map.instance
      .exportAsJSON()
      .map(node => ({ ...node, colors: { ...node.colors, name: 'red' } }));

    expect(() => map.instance.new(nodes)).toThrow(
      'The snapshot is not correct'
    );
  });
});
