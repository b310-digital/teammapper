import * as d3 from 'd3';
import { create } from '../index.js';
import MmpMap from './map.js';
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
  create: true,
  nodeSelect: true,
  nodeDeselect: true,
  nodeUpdate: true,
  nodeCreate: true,
  nodePaste: true,
  nodeRemove: true,
  distribute: true,
  nodeProtected: true,
} satisfies Record<Exclude<MmpEventType, 'viewStateChange'>, true>) as Exclude<
  MmpEventType,
  'viewStateChange'
>[];

/**
 * The frontend reaches the library through `MmpInstance` alone, so these specs
 * drive a real map through it: every node property, the protection and the
 * events.
 */

const IMAGE_REFERENCE = 'image:5f0c4b1e-3a8d-4c6e-9f2a-7b1d2e3f4a5b';

beforeAll(stubSvgLengths);

function makeMap(): MmpMap {
  const ref = document.createElement('div');
  document.body.appendChild(ref);
  const map = create('map', ref);
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
    it('writes the value to the model', () => {
      const { map, child } = makeMapWithChild();

      map.instance.updateNode(property, value, true, child);

      expect(read(exported(map, child))).toEqual(value);
    });

    it('announces the change with the previous value', () => {
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

    it('announces nothing when the value stays the same', () => {
      const { map, child } = makeMapWithChild();
      map.instance.updateNode(property, value, true, child);
      const listener = jest.fn();
      map.instance.on('nodeUpdate', listener);

      map.instance.updateNode(property, value, true, child);

      expect(listener).not.toHaveBeenCalled();
    });

    it('announces nothing without notifyWithEvent', () => {
      const { map, child } = makeMapWithChild();
      const listener = jest.fn();
      map.instance.on('nodeUpdate', listener);

      map.instance.updateNode(property, value, false, child);

      expect(listener).not.toHaveBeenCalled();
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
  ])('refuses %s %p and keeps the model', (property, value) => {
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
    map.instance.on('nodeSelect', node => selected.push(node.id));
    map.instance.on('nodeDeselect', node => deselected.push(node.id));
    const root = rootOf(map);

    const node = map.instance.addNode({ name: 'a' });
    if (!node) throw new Error('addNode added no node');
    map.instance.updateNode('backgroundColor', '#ff0000', true, node.id);
    map.instance.selectNode(node.id);
    map.instance.removeNode(node.id);

    expect(selected).toEqual([node.id]);
    expect(deselected).toEqual([root, node.id]);
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

describe('destroy', () => {
  it('removes the svg, every subscription and the resize listener', () => {
    const map = makeMap();
    const ref = map.dom.container.node();
    const listener = jest.fn();
    map.instance.on('nodeSelect', listener);

    map.instance.destroy();

    expect(ref?.querySelector('svg')).toBeNull();
    expect(d3.select(window).on('resize.map')).toBeUndefined();
    map.events.emit(
      'nodeSelect',
      map.nodes.getNodeProperties(map.nodes.getRoot())
    );
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
