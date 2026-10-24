import { normalizeMapData, normalizeMapNode } from './normalizeMapData';

describe('normalizeMapData', () => {
  it('normalizes legacy empty / invalid map data into canonical structure', () => {
    const normalized = normalizeMapData(null);
    expect(normalized.uuid).toBe('');
    expect(normalized.data).toEqual([]);
    expect(normalized.options).toEqual({});
  });

  it('normalizes a legacy node and gives it no hidden keys', () => {
    const legacyNode = {
      id: 'n1',
      parent: null,
      isRoot: true,
      name: 'Legacy Node',
      coordinates: { x: 50, y: 50 },
    };

    const node = normalizeMapNode(legacyNode);
    expect(node).not.toHaveProperty('hidden');
    expect(node).not.toHaveProperty('hasHiddenChildNodes');
    expect(node.name).toBe('Legacy Node');
    expect(node.coordinates).toEqual({ x: 50, y: 50 });
  });

  it('drops the hidden keys of cached data', () => {
    const cachedNode = {
      id: 'n2',
      parent: 'n1',
      name: 'Cached Node',
      hidden: true,
      hasHiddenChildNodes: true,
    };

    const node = normalizeMapNode(cachedNode);
    expect(node).not.toHaveProperty('hidden');
    expect(node).not.toHaveProperty('hasHiddenChildNodes');
  });

  it('gives the default node no hidden keys', () => {
    const node = normalizeMapNode(null);
    expect(node).not.toHaveProperty('hidden');
    expect(node).not.toHaveProperty('hasHiddenChildNodes');
  });

  it('neutralizes prototype pollution properties', () => {
    const malicious = JSON.parse(
      '{"id": "node-1", "__proto__": {"polluted": true}, "colors": {"constructor": "exploit"}}'
    );
    const node = normalizeMapNode(malicious);
    expect(
      (node as unknown as Record<string, unknown>).polluted
    ).toBeUndefined();
    expect(node.id).toBe('node-1');
  });

  it('normalizes full map data with multiple nodes and options', () => {
    const rawMap = {
      uuid: 'map-uuid-1',
      data: [
        { id: 'root', parent: null, name: 'Root' },
        { id: 'child-1', parent: 'root', name: 'Child 1' },
      ],
      options: {
        fontMaxSize: 24,
      },
      deleteAfterDays: 30,
    };

    const map = normalizeMapData(rawMap);
    expect(map.uuid).toBe('map-uuid-1');
    expect(map.data.length).toBe(2);
    expect(map.data[0].isRoot).toBe(true);
    expect(map.data[1].name).toBe('Child 1');
    expect(map.options.fontMaxSize).toBe(24);
    expect(map.deleteAfterDays).toBe(30);
  });
});
