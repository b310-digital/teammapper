import * as d3 from 'd3';
import { create } from '../../index.js';
import { DefaultNodeValues, DefaultRootNodeValues } from '../options.js';
import { nodeRecord, stubMap } from '../../test/stub-map.js';
import { stubSvgLengths } from '../../test/svg-lengths.js';
import type { ExportNodeProperties, MapSnapshot } from '@teammapper/shared';

/**
 * A JSON export or a peer running an older release still carries the
 * `detached` key. mmp reads no such key, so a former detached node loads as a
 * root at its stored position and takes children like any other root. A node
 * whose parent the map lacks counts as a root too.
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

const LEGACY_MAP: MapSnapshot = [
  legacyNode('root', '', {
    ...DefaultRootNodeValues,
    isRoot: true,
    coordinates: { x: 0, y: 0 },
  }),
  legacyNode('child', 'root', { coordinates: { x: -200, y: -120 } }),
  legacyNode('note', '', { detached: true, coordinates: { x: 900, y: -400 } }),
  legacyNode('pasted', 'note', { coordinates: { x: 700, y: -400 } }),
];

function loadLegacyMap() {
  const stub = stubMap();
  stub.map.loader.load(LEGACY_MAP.map(node => ({ ...node })));
  return stub;
}

describe('a map whose nodes still carry the detached key', () => {
  it('loads every node', () => {
    const { map } = loadLegacyMap();

    expect(
      map.export
        .asJSON()
        .map(node => node.id)
        .sort()
    ).toEqual(['child', 'note', 'pasted', 'root']);
  });

  it('loads a former detached node as a root at its stored position', () => {
    const { nodes } = loadLegacyMap();
    const note = nodes.record('note');

    expect({
      parent: nodes.parentOf('note'),
      isRoot: note?.isRoot,
      coordinates: note?.coordinates,
    }).toEqual({
      parent: null,
      isRoot: false,
      coordinates: { x: 900, y: -400 },
    });
  });

  it('keeps the pasted child under the former detached node', () => {
    const { nodes } = loadLegacyMap();

    expect(nodes.parentOf('pasted')).toBe('note');
  });

  it('keeps the main root as the only node with isRoot set', () => {
    const { map } = loadLegacyMap();

    expect(
      map.export
        .asJSON()
        .filter(node => node.isRoot)
        .map(node => node.id)
    ).toEqual(['root']);
  });

  it('adds a child to a former detached node', () => {
    const { nodes } = loadLegacyMap();

    const added = nodes.addNode({ name: 'new' }, false, 'note');

    expect(nodes.parentOf(added.id)).toBe('note');
  });

  it('keeps no detached key', () => {
    const { map } = loadLegacyMap();

    expect(map.export.asJSON().some(node => 'detached' in node)).toBe(false);
  });

  it('adds a synced former detached node as a root whatever is selected', () => {
    const { nodes } = loadLegacyMap();

    nodes.addNodes([
      legacyNode('synced', '', {
        detached: true,
        coordinates: { x: 5, y: 5 },
      }),
    ]);

    expect(nodes.parentOf('synced')).toBeNull();
  });
});

describe('a node whose parent the map lacks', () => {
  const ORPHANED: MapSnapshot = [
    nodeRecord({ id: 'root', isRoot: true }),
    nodeRecord({ id: 'child', parent: 'root', coordinates: { x: 200, y: 0 } }),
    nodeRecord({
      id: 'orphan',
      parent: 'missing',
      coordinates: { x: 600, y: 0 },
    }),
    nodeRecord({ id: 'leaf', parent: 'orphan', coordinates: { x: 800, y: 0 } }),
  ];

  beforeAll(stubSvgLengths);

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('answers the tree queries as a root', () => {
    const { nodes } = stubMap(ORPHANED);

    expect(nodes.parentOf('orphan')).toBeNull();
    expect(nodes.treeRoot('leaf')).toBe('orphan');
    expect(nodes.level('leaf')).toBe(2);
    expect(nodes.orientation('orphan')).toBeUndefined();
  });

  it('draws as a root: a node without a branch', () => {
    const ref = document.createElement('div');
    document.body.appendChild(ref);
    create('map', ref).instance.new(ORPHANED, false);

    const branches = d3.selectAll<SVGPathElement, string>('path.branch');
    expect(branches.data().sort()).toEqual(['child', 'leaf']);
    expect(d3.selectAll<SVGGElement, string>('g.node').data()).toContain(
      'orphan'
    );
  });
});
