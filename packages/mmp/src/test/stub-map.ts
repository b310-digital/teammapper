import * as d3 from 'd3';
import type { ExportNodeProperties, MapSnapshot } from '@teammapper/shared';
import InMemoryMapData from '../map/data/in-memory-map-data.js';
import CopyPaste from '../map/handlers/copy-paste.js';
import Drag from '../map/handlers/drag.js';
import MapLoader from '../map/handlers/map-loader.js';
import Nodes from '../map/handlers/nodes.js';
import ViewState from '../map/handlers/view-state.js';
import MmpMap from '../map/map.js';
import { DefaultNodeValues, DefaultRootNodeValues } from '../map/options.js';
import { fakeDraw } from './fake-draw.js';

/**
 * A full node record with the default styling, `overrides` applied. Every
 * node starts at the origin, unprotected, with k 1 and no parent.
 */
export function nodeRecord(
  overrides: Partial<ExportNodeProperties> & { id: string }
): ExportNodeProperties {
  return {
    parent: null,
    k: 1,
    name: '',
    coordinates: { x: 0, y: 0 },
    image: { ...DefaultNodeValues.image },
    colors: { ...DefaultNodeValues.colors },
    font: { ...DefaultNodeValues.font },
    link: { ...DefaultNodeValues.link },
    protected: false,
    isRoot: false,
    ...overrides,
  };
}

/**
 * A map without a DOM around the real node handler, view state, loader,
 * drag and clipboard, over an `InMemoryMapData` holding `snapshot`. The
 * renderer is `fakeDraw`, the zoom pans and centers nothing, and every event
 * goes to the `events.emit` mock. `overrides` replaces any of these
 * stand-ins. The map draws the snapshot as a replaced map, which selects the
 * main root, and then clears the `events.emit` mock.
 */
export function stubMap(
  snapshot: MapSnapshot = [],
  overrides: Record<string, unknown> = {}
) {
  const data = new InMemoryMapData(snapshot);
  const parts = {
    id: 'test-map',
    data,
    options: {
      defaultNode: DefaultNodeValues,
      rootNode: DefaultRootNodeValues,
      fontFamily: 'Arial',
    },
    draw: fakeDraw(),
    events: { emit: jest.fn() },
    zoom: {
      center: jest.fn(),
      panIntoView: jest.fn(),
      visibleArea: () => null,
    },
    dom: { svg: { node: () => null } },
    ...overrides,
  };
  const map = parts as unknown as MmpMap;
  map.viewState = new ViewState();
  map.nodes = new Nodes(map);
  map.loader = new MapLoader(map);
  map.copyPaste = new CopyPaste(map);
  map.drag = new Drag(map);

  map.data.subscribe(map.nodes.onChange);
  map.nodes.drawReplaced();
  parts.events.emit.mockClear();

  return { map, nodes: map.nodes, ...parts };
}

/** The calls of the `events.emit` mock for `event`. */
export function emitted(emit: jest.Mock, event: string): unknown[] {
  return emit.mock.calls
    .filter(([name]) => name === event)
    .map(([, payload]) => payload);
}

/** The event names mmp fired, in order. */
export function firedEvents(events: { emit: jest.Mock }): string[] {
  return events.emit.mock.calls.map(call => call[0]);
}

/**
 * The ring selection draws on a background filled with `fill`: the fill
 * darkened by 0.5. Computed here apart from `Draw.ringColor`, so a change
 * there fails the ring specs.
 */
export function ring(fill: string): string | undefined {
  return d3.color(fill)?.darker(0.5).toString();
}
