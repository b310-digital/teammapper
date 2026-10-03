import * as d3 from 'd3';
import Nodes from './nodes.js';
import { fakeDraw } from '../../test/fake-draw.js';
import MapLoader from './map-loader.js';
import ViewState from './view-state.js';
import MmpMap from '../map.js';
import Options, {
  DefaultNodeValues,
  DefaultRootNodeValues,
} from '../options.js';
import type { ExportNodeProperties, MapSnapshot } from '@teammapper/shared';

/**
 * A map stub around the real node handler and map loader, with a renderer that
 * keeps the rings.
 */
function makeMap() {
  const events = { emit: jest.fn() };
  const map = {
    rootId: '',
    options: {
      defaultNode: DefaultNodeValues,
      rootNode: DefaultRootNodeValues,
    },
    draw: fakeDraw(),
    zoom: { center: jest.fn() },
    events,
    export: { asJSON: () => [] },
  } as unknown as MmpMap;
  map.nodes = new Nodes(map);
  map.viewState = new ViewState(map);
  map.loader = new MapLoader(map);
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

function mapNodes(rootId: string, background = '#f0f6f5'): MapSnapshot {
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
function firedEvents(events: { emit: jest.Mock }): string[] {
  return events.emit.mock.calls.map(call => call[0]);
}

// A map load selects the main root: it draws the ring on the root and tells
// listeners through `nodeSelect`, even when the load itself fires no event.
describe('a map load', () => {
  it('draws the ring on the root and selects it', () => {
    const { map } = makeMap();

    map.loader.load(mapNodes('root'), false);

    const root = map.nodes.getRoot();
    expect(map.draw.ringOf(root)).toBe(ring('#f0f6f5'));
    expect(map.nodes.getSelectedNode()).toBe(root);
  });

  it('fires nodeSelect for the root although it fires no create event', () => {
    const { map, events } = makeMap();

    map.loader.load(mapNodes('root'), false);

    expect(events.emit).toHaveBeenCalledWith(
      'nodeSelect',
      expect.objectContaining({ id: 'root' })
    );
    expect(firedEvents(events)).not.toContain('create');
  });

  it('rings the new root DOM when the same map loads twice', () => {
    const { map, events } = makeMap();
    map.loader.load(mapNodes('root'), false);
    events.emit.mockClear();

    map.loader.load(mapNodes('root'), false);

    const root = map.nodes.getRoot();
    expect(map.draw.ringOf(root)).toBe(ring('#f0f6f5'));
    expect(firedEvents(events)).toEqual(['nodeSelect']);
  });

  it('selects the new root when a map with another root loads', () => {
    const { map, events } = makeMap();
    map.loader.load(mapNodes('root'), false);
    events.emit.mockClear();

    map.loader.load(mapNodes('other-root'), false);

    const root = map.nodes.getRoot();
    expect(root.id).toBe('other-root');
    expect(map.draw.ringOf(root)).toBe(ring('#f0f6f5'));
    expect(firedEvents(events)).toEqual(['nodeSelect']);
    expect(events.emit.mock.calls[0][1].id).toBe('other-root');
  });

  it('rings the root it creates when no nodes are given', () => {
    const { map, events } = makeMap();

    map.loader.load(undefined, false);

    const root = map.nodes.getRoot();
    expect(map.draw.ringOf(root)).toBe(
      ring(DefaultRootNodeValues.colors.background)
    );
    expect(events.emit).toHaveBeenCalledWith(
      'nodeSelect',
      expect.objectContaining({ id: root.id })
    );
  });

  it('selects a root without a background colour', () => {
    const { map, events } = makeMap();

    map.loader.load(mapNodes('root', ''), false);

    expect(map.nodes.getSelectedNode()?.id).toBe('root');
    expect(firedEvents(events)).toEqual(['nodeSelect']);
  });
});

describe('an edit mode change after a map load', () => {
  it('draws the ring on the selected root again', () => {
    const { map } = makeMap();
    map.loader.load(mapNodes('root'), false);

    new Options({}, map).update('edit', false);

    const root = map.nodes.getRoot();
    expect(map.nodes.getSelectedNode()).toBe(root);
    expect(map.draw.ringOf(root)).toBe(ring('#f0f6f5'));
  });
});

describe('removing a node after a map load', () => {
  it('draws the ring on the selected root again', () => {
    const { map } = makeMap();
    map.loader.load(mapNodes('root'), false);

    map.nodes.removeNode('child', false);

    const root = map.nodes.getRoot();
    expect(map.nodes.getSelectedNode()).toBe(root);
    expect(map.draw.ringOf(root)).toBe(ring('#f0f6f5'));
  });
});

describe('selectRootNode', () => {
  it('fires nodeSelect once when called twice', () => {
    const { map, events } = makeMap();
    map.loader.load(mapNodes('root'), false);
    map.nodes.deselectNode();
    events.emit.mockClear();

    map.nodes.selectRootNode();
    map.nodes.selectRootNode();

    expect(firedEvents(events)).toEqual(['nodeSelect']);
  });
});
