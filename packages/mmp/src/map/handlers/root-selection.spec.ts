import Options, { DefaultRootNodeValues } from '../options.js';
import type MmpMap from '../map.js';
import { firedEvents, nodeRecord, ring, stubMap } from '../../test/stub-map.js';
import type { MapSnapshot } from '@teammapper/shared';

function mapNodes(rootId: string, background = '#f0f6f5'): MapSnapshot {
  return [
    nodeRecord({
      id: rootId,
      ...DefaultRootNodeValues,
      colors: { ...DefaultRootNodeValues.colors, background },
      isRoot: true,
      coordinates: { x: 0, y: 0 },
    }),
    nodeRecord({ id: 'child', parent: rootId, coordinates: { x: 200, y: 0 } }),
  ];
}

function rootId(map: MmpMap): string {
  return map.nodes.exportRootProperties().id;
}

// A map load selects the main root: it draws the ring on the root and tells
// listeners through `nodeSelect`.
describe('a map load', () => {
  it('draws the ring on the root and selects it', () => {
    const { map } = stubMap();

    map.loader.load(mapNodes('root'));

    expect(map.draw.ringOf('root')).toBe(ring('#f0f6f5'));
    expect(map.nodes.getSelectedNode()?.id).toBe('root');
  });

  it('fires nodeSelect for the root, then create', () => {
    const { map, events } = stubMap();

    map.loader.load(mapNodes('root'));

    expect(events.emit).toHaveBeenCalledWith(
      'nodeSelect',
      expect.objectContaining({ id: 'root' })
    );
    expect(firedEvents(events)).toEqual(['nodeSelect', 'create']);
  });

  it('rings the new root DOM when the same map loads twice', () => {
    const { map, events } = stubMap();
    map.loader.load(mapNodes('root'));
    events.emit.mockClear();

    map.loader.load(mapNodes('root'));

    expect(map.draw.ringOf('root')).toBe(ring('#f0f6f5'));
    expect(firedEvents(events)).toEqual(['nodeSelect', 'create']);
  });

  it('selects the new root when a map with another root loads', () => {
    const { map, events } = stubMap();
    map.loader.load(mapNodes('root'));
    events.emit.mockClear();

    map.loader.load(mapNodes('other-root'));

    expect(rootId(map)).toBe('other-root');
    expect(map.draw.ringOf('other-root')).toBe(ring('#f0f6f5'));
    expect(firedEvents(events)).toEqual(['nodeSelect', 'create']);
    expect(events.emit.mock.calls[0][1].id).toBe('other-root');
  });

  it('rings the root it creates when no nodes are given', () => {
    const { map, events } = stubMap();

    map.loader.load();

    const root = rootId(map);
    expect(map.draw.ringOf(root)).toBe(
      ring(DefaultRootNodeValues.colors.background)
    );
    expect(events.emit).toHaveBeenCalledWith(
      'nodeSelect',
      expect.objectContaining({ id: root })
    );
  });

  it('selects a root without a background colour', () => {
    const { map, events } = stubMap();

    map.loader.load(mapNodes('root', ''));

    expect(map.nodes.getSelectedNode()?.id).toBe('root');
    expect(firedEvents(events)).toEqual(['nodeSelect', 'create']);
  });
});

describe('an edit mode change after a map load', () => {
  it('draws the ring on the selected root again', () => {
    const { map } = stubMap();
    map.loader.load(mapNodes('root'));

    new Options({}, map).update('edit', false);

    expect(map.nodes.getSelectedNode()?.id).toBe('root');
    expect(map.draw.ringOf('root')).toBe(ring('#f0f6f5'));
  });
});

describe('removing a node after a map load', () => {
  it('keeps the ring on the selected root', () => {
    const { map } = stubMap();
    map.loader.load(mapNodes('root'));

    map.nodes.removeNode('child');

    expect(map.nodes.getSelectedNode()?.id).toBe('root');
    expect(map.draw.ringOf('root')).toBe(ring('#f0f6f5'));
  });
});

describe('selectRootNode', () => {
  it('fires nodeSelect once when called twice', () => {
    const { map, events } = stubMap();
    map.loader.load(mapNodes('root'));
    map.nodes.deselectNode();
    events.emit.mockClear();

    map.nodes.selectRootNode();
    map.nodes.selectRootNode();

    expect(firedEvents(events)).toEqual(['nodeSelect']);
  });
});
