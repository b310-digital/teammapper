import * as d3 from 'd3';
import Nodes from './nodes.js';
import History from './history.js';
import MmpMap from '../map.js';
import { Event } from './events.js';
import Options, {
  DefaultNodeValues,
  DefaultRootNodeValues,
} from '../options.js';
import type { ExportNodeProperties, MapSnapshot } from '@teammapper/shared';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** The parts of a node's DOM that selection reads: the background and name. */
function nodeDom(fill: string): SVGGElement {
  const group = document.createElementNS(SVG_NS, 'g');
  const background = document.createElementNS(SVG_NS, 'path');
  background.style.fill = fill;
  const foreignObject = document.createElementNS(SVG_NS, 'foreignObject');
  foreignObject.appendChild(document.createElement('div'));
  group.append(background, foreignObject);
  return group;
}

/**
 * A map stub around the real node handler and history. Its draw gives each
 * node a DOM filled with the node's background colour.
 */
function makeMap() {
  const events = { call: jest.fn() };
  const update = jest.fn(() => {
    for (const node of map.nodes.getNodes()) {
      node.dom = nodeDom(node.colors.background);
    }
  });
  const map = {
    rootId: '',
    options: {
      defaultNode: DefaultNodeValues,
      rootNode: DefaultRootNodeValues,
    },
    draw: { clear: jest.fn(), update },
    zoom: { center: jest.fn() },
    events,
    export: { asJSON: () => [] },
  } as unknown as MmpMap;
  map.nodes = new Nodes(map);
  map.history = new History(map);
  return { map, events };
}

function node(
  id: string,
  parent: string,
  overrides: Partial<ExportNodeProperties> = {}
): ExportNodeProperties {
  return {
    ...DefaultNodeValues,
    colors: { ...DefaultNodeValues.colors },
    id,
    parent,
    k: 1,
    ...overrides,
  } as ExportNodeProperties;
}

function snapshot(rootId: string, background = '#f0f6f5'): MapSnapshot {
  return [
    node(rootId, '', {
      ...DefaultRootNodeValues,
      colors: { ...DefaultRootNodeValues.colors, background },
      isRoot: true,
      coordinates: { x: 0, y: 0 },
    }),
    node('child', rootId, { coordinates: { x: 200, y: 0 } }),
  ];
}

/** The ring selection draws on a background filled with `fill`. */
function ring(fill: string): string | undefined {
  return d3.color(fill)?.darker(0.5).toString();
}

/** The event names mmp fired, in order. */
function firedEvents(events: { call: jest.Mock }): string[] {
  return events.call.mock.calls.map(call => call[0]);
}

// A map load selects the main root: it draws the ring on the root and tells
// listeners through `nodeSelect`, even when the load itself fires no event.
describe('a map load', () => {
  it('draws the ring on the root and selects it', () => {
    const { map } = makeMap();

    map.history.new(snapshot('root'), false);

    const root = map.nodes.getRoot();
    expect(root.getBackgroundDOM().style.stroke).toBe(ring('#f0f6f5'));
    expect(map.nodes.getSelectedNode()).toBe(root);
  });

  it('fires nodeSelect for the root although it fires no create event', () => {
    const { map, events } = makeMap();

    map.history.new(snapshot('root'), false);

    expect(events.call).toHaveBeenCalledWith(
      Event.nodeSelect,
      expect.anything(),
      expect.objectContaining({ id: 'root' })
    );
    expect(firedEvents(events)).not.toContain(Event.create);
  });

  it('rings the new root DOM when the same map loads twice', () => {
    const { map, events } = makeMap();
    map.history.new(snapshot('root'), false);
    events.call.mockClear();

    map.history.new(snapshot('root'), false);

    const root = map.nodes.getRoot();
    expect(root.getBackgroundDOM().style.stroke).toBe(ring('#f0f6f5'));
    expect(firedEvents(events)).toEqual([Event.nodeSelect]);
  });

  it('selects the new root when a map with another root loads', () => {
    const { map, events } = makeMap();
    map.history.new(snapshot('root'), false);
    events.call.mockClear();

    map.history.new(snapshot('other-root'), false);

    const root = map.nodes.getRoot();
    expect(root.id).toBe('other-root');
    expect(root.getBackgroundDOM().style.stroke).toBe(ring('#f0f6f5'));
    expect(firedEvents(events)).toEqual([Event.nodeSelect]);
    expect(events.call.mock.calls[0][2].id).toBe('other-root');
  });

  it('rings the root it creates when no snapshot is given', () => {
    const { map, events } = makeMap();

    map.history.new(undefined, false);

    const root = map.nodes.getRoot();
    expect(root.getBackgroundDOM().style.stroke).toBe(
      ring(DefaultRootNodeValues.colors.background)
    );
    expect(events.call).toHaveBeenCalledWith(
      Event.nodeSelect,
      root.dom,
      expect.objectContaining({ id: root.id })
    );
  });

  it('selects a root without a background colour', () => {
    const { map, events } = makeMap();

    map.history.new(snapshot('root', ''), false);

    expect(map.nodes.getSelectedNode()?.id).toBe('root');
    expect(firedEvents(events)).toEqual([Event.nodeSelect]);
  });
});

describe('an edit mode change after a map load', () => {
  it('draws the ring on the new DOM of the selected root', () => {
    const { map } = makeMap();
    map.history.new(snapshot('root'), false);

    new Options({}, map).update('edit', false);

    const root = map.nodes.getRoot();
    expect(map.nodes.getSelectedNode()).toBe(root);
    expect(root.getBackgroundDOM().style.stroke).toBe(ring('#f0f6f5'));
  });
});

describe('removing a node after a map load', () => {
  it('draws the ring on the new DOM of the selected root', () => {
    const { map } = makeMap();
    map.history.new(snapshot('root'), false);

    map.nodes.removeNode('child', false);

    const root = map.nodes.getRoot();
    expect(map.nodes.getSelectedNode()).toBe(root);
    expect(root.getBackgroundDOM().style.stroke).toBe(ring('#f0f6f5'));
  });
});

describe('selectRootNode', () => {
  it('fires nodeSelect once when called twice', () => {
    const { map, events } = makeMap();
    map.history.new(snapshot('root'), false);
    map.nodes.deselectNode();
    events.call.mockClear();

    map.nodes.selectRootNode();
    map.nodes.selectRootNode();

    expect(firedEvents(events)).toEqual([Event.nodeSelect]);
  });
});
