import Nodes from './nodes.js';
import History from './history.js';
import MmpMap from '../map.js';
import { DefaultNodeValues, DefaultRootNodeValues } from '../options.js';
import type { ExportNodeProperties, MapSnapshot } from '@teammapper/shared';

/**
 * A JSON export or a peer running an older release still carries the
 * `detached` key. mmp reads no such key, so a former detached node loads as a
 * root at its stored position and takes children like any other root.
 */

/** A node the way an older release exported it, `detached` key included. */
function legacyNode(
  id: string,
  parent: string,
  overrides: Record<string, unknown> = {}
): ExportNodeProperties {
  return {
    ...DefaultNodeValues,
    colors: { ...DefaultNodeValues.colors },
    id,
    parent,
    k: 1,
    detached: false,
    ...overrides,
  } as ExportNodeProperties;
}

const LEGACY_SNAPSHOT: MapSnapshot = [
  legacyNode('root', '', {
    ...DefaultRootNodeValues,
    isRoot: true,
    coordinates: { x: 0, y: 0 },
  }),
  legacyNode('child', 'root', { coordinates: { x: -200, y: -120 } }),
  legacyNode('note', '', { detached: true, coordinates: { x: 900, y: -400 } }),
  legacyNode('pasted', 'note', { coordinates: { x: 700, y: -400 } }),
];

/** A map stub around the real node handler and history, drawing nothing. */
function makeMap(): MmpMap {
  const map = {
    rootId: '',
    options: { defaultNode: DefaultNodeValues },
    draw: { clear: jest.fn(), update: jest.fn() },
    zoom: { center: jest.fn() },
    events: { call: jest.fn() },
    export: { asJSON: () => [] },
  } as unknown as MmpMap;
  map.nodes = new Nodes(map);
  map.history = new History(map);
  return map;
}

function loadLegacySnapshot(): MmpMap {
  const map = makeMap();
  map.history.new(
    LEGACY_SNAPSHOT.map(node => ({ ...node })),
    false
  );
  return map;
}

describe('a snapshot that still carries the detached key', () => {
  it('loads every node', () => {
    const map = loadLegacySnapshot();

    expect(
      map.nodes
        .getNodes()
        .map(node => node.id)
        .sort()
    ).toEqual(['child', 'note', 'pasted', 'root']);
  });

  it('loads a former detached node as a root at its stored position', () => {
    const note = loadLegacySnapshot().nodes.getNode('note');

    expect({
      parent: note?.parent,
      isRoot: note?.isRoot,
      coordinates: note?.coordinates,
    }).toEqual({
      parent: null,
      isRoot: false,
      coordinates: { x: 900, y: -400 },
    });
  });

  it('keeps the pasted child under the former detached node', () => {
    const pasted = loadLegacySnapshot().nodes.getNode('pasted');

    expect(pasted?.parent?.id).toBe('note');
  });

  it('keeps the main root as the only node with the main-root mark', () => {
    const map = loadLegacySnapshot();

    expect(
      map.nodes
        .getNodes()
        .filter(node => node.isRoot)
        .map(node => node.id)
    ).toEqual(['root']);
  });

  it('adds a child to a former detached node', () => {
    const map = loadLegacySnapshot();

    const added = map.nodes.addNode({ name: 'new' }, false, false, 'note');

    expect(added.parent?.id).toBe('note');
  });

  it('exports no detached key', () => {
    const map = loadLegacySnapshot();

    const exported = map.nodes
      .getNodes()
      .map(node => map.nodes.getNodeProperties(node));
    expect(exported.some(node => 'detached' in node)).toBe(false);
  });

  it('adds a synced former detached node as a root whatever is selected', () => {
    const map = loadLegacySnapshot();
    map.nodes.selectRootNode();

    map.nodes.addNodes(
      [
        legacyNode('synced', '', {
          detached: true,
          coordinates: { x: 5, y: 5 },
        }),
      ],
      false
    );

    expect(map.nodes.getNode('synced')?.parent).toBeNull();
  });
});
