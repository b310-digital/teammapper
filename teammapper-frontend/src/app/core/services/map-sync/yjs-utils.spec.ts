import * as Y from 'yjs';
import { ExportNodeProperties } from '@mmp/map/types';
import {
  populateYMapFromNodeProps,
  yMapToNodeProps,
  buildYjsWsUrl,
  parseWriteAccessBytes,
  resolveClientColor,
  findAffectedNodes,
  resolveMmpPropertyUpdate,
  resolveCompoundMmpUpdates,
  sortParentFirst,
  collectDescendantIds,
} from './yjs-utils';

// Mock the NodePropertyMapping module
jest.mock('@mmp/index', () => ({
  NodePropertyMapping: {
    name: ['name'],
    locked: ['locked'],
    coordinates: ['coordinates'],
    imageSrc: ['image', 'src'],
    imageSize: ['image', 'size'],
    linkHref: ['link', 'href'],
    backgroundColor: ['colors', 'background'],
    branchColor: ['colors', 'branch'],
    fontWeight: ['font', 'weight'],
    fontStyle: ['font', 'style'],
    fontSize: ['font', 'size'],
    nameColor: ['colors', 'name'],
    hidden: ['hidden'],
  },
}));

// Import NodePropertyMapping after mocking - needed for reverse mapping
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { NodePropertyMapping } from '@mmp/index';

function createMockNode(
  overrides?: Partial<ExportNodeProperties>
): ExportNodeProperties {
  return {
    id: 'mock-id',
    name: 'Mock Node',
    parent: 'root',
    k: 1,
    colors: { branch: '#000000' },
    font: { size: 14, style: 'normal', weight: 'normal' },
    locked: false,
    hidden: false,
    coordinates: undefined,
    image: undefined,
    link: undefined,
    isRoot: false,
    detached: false,
    ...overrides,
  };
}

// ─── Y.Doc conversion utilities ──────────────────────────────

describe('Y.Doc conversion utilities', () => {
  let doc: Y.Doc;
  let nodesMap: Y.Map<Y.Map<unknown>>;

  beforeEach(() => {
    doc = new Y.Doc();
    nodesMap = doc.getMap('nodes') as Y.Map<Y.Map<unknown>>;
  });

  afterEach(() => {
    doc.destroy();
  });

  it('round-trips node properties through Y.Map', () => {
    const input = createMockNode({
      id: 'n1',
      name: 'Hello',
      parent: 'root',
      k: 1.5,
      isRoot: false,
      locked: true,
      detached: true,
      coordinates: { x: 100, y: 200 },
      colors: { name: '#ff0000', background: '#00ff00', branch: '#0000ff' },
      font: { size: 16, style: 'italic', weight: 'bold' },
      image: { src: 'http://img.png', size: 50 },
      link: { href: 'http://example.com' },
    });

    const yNode = new Y.Map<unknown>();
    populateYMapFromNodeProps(yNode, input);
    nodesMap.set('n1', yNode);

    const result = yMapToNodeProps(nodesMap.get('n1')!);

    expect(result).toEqual(
      expect.objectContaining({
        id: 'n1',
        name: 'Hello',
        parent: 'root',
        k: 1.5,
        isRoot: false,
        locked: true,
        detached: true,
        coordinates: { x: 100, y: 200 },
        colors: {
          name: '#ff0000',
          background: '#00ff00',
          branch: '#0000ff',
        },
        font: { size: 16, style: 'italic', weight: 'bold' },
        image: { src: 'http://img.png', size: 50 },
        link: { href: 'http://example.com' },
      })
    );
  });

  it('applies defaults for missing optional properties', () => {
    const input: ExportNodeProperties = {
      id: 'n2',
      parent: undefined,
      k: undefined,
      name: undefined,
      isRoot: undefined,
      locked: undefined,
      detached: undefined,
      coordinates: undefined,
      colors: undefined,
      font: undefined,
      image: undefined,
      link: undefined,
    } as unknown as ExportNodeProperties;

    const yNode = new Y.Map<unknown>();
    populateYMapFromNodeProps(yNode, input);
    nodesMap.set('n2', yNode);

    const result = yMapToNodeProps(nodesMap.get('n2')!);

    expect(result).toEqual(
      expect.objectContaining({
        parent: null,
        k: 1,
        name: '',
        isRoot: false,
        locked: false,
        detached: false,
        coordinates: { x: 0, y: 0 },
      })
    );
  });
});

// ─── Write access message parsing ────────────────────────────

describe('write access message parsing', () => {
  it('returns true for writable message', () => {
    const result = parseWriteAccessBytes(new Uint8Array([4, 1]));
    expect(result).toBe(true);
  });

  it('returns false for read-only message', () => {
    const result = parseWriteAccessBytes(new Uint8Array([4, 0]));
    expect(result).toBe(false);
  });

  it('returns null for wrong type byte', () => {
    const result = parseWriteAccessBytes(new Uint8Array([0, 1]));
    expect(result).toBeNull();
  });

  it('returns null for message too short to be valid', () => {
    const result = parseWriteAccessBytes(new Uint8Array([4]));
    expect(result).toBeNull();
  });
});

// ─── Yjs URL building ────────────────────────────────────────

describe('Yjs URL building', () => {
  let querySelectorSpy: jest.SpyInstance;

  beforeEach(() => {
    querySelectorSpy = jest.spyOn(document, 'querySelector');
  });

  afterEach(() => {
    querySelectorSpy.mockRestore();
  });

  // jsdom default location is http://localhost, so tests use that baseline
  it('builds ws URL and uses document base href', () => {
    querySelectorSpy.mockReturnValue({
      getAttribute: () => '/',
    });

    const url = buildYjsWsUrl();

    // jsdom runs on http://localhost -> ws:
    expect(url).toBe('ws://localhost/yjs');
  });

  it('incorporates base href into path', () => {
    querySelectorSpy.mockReturnValue({
      getAttribute: () => '/app/',
    });

    const url = buildYjsWsUrl();

    expect(url).toBe('ws://localhost/app/yjs');
  });

  it('appends trailing slash to base href if missing', () => {
    querySelectorSpy.mockReturnValue({
      getAttribute: () => '/app',
    });

    const url = buildYjsWsUrl();

    expect(url).toBe('ws://localhost/app/yjs');
  });

  it('defaults base href to / when no base element', () => {
    querySelectorSpy.mockReturnValue(null);

    const url = buildYjsWsUrl();

    expect(url).toBe('ws://localhost/yjs');
  });

  it('selects protocol based on page protocol', () => {
    // Verify the protocol-selection logic via the method output
    // jsdom defaults to http: -> ws:, confirming the mapping works
    querySelectorSpy.mockReturnValue(null);
    const url = buildYjsWsUrl();
    expect(url).toMatch(/^ws:\/\//);
    // The https: -> wss: path uses the same ternary expression
  });
});

// ─── Y.Doc property application to MMP ───────────────────────

describe('Y.Doc property application to MMP', () => {
  it('resolves simple property (name) via reverse mapping', () => {
    const updates = resolveMmpPropertyUpdate('name', 'New Name');
    expect(updates).toEqual([{ prop: 'name', val: 'New Name' }]);
  });

  it('resolves simple property (locked) via reverse mapping', () => {
    const updates = resolveMmpPropertyUpdate('locked', true);
    expect(updates).toEqual([{ prop: 'locked', val: true }]);
  });

  it('resolves compound property (colors) via reverse mapping', () => {
    const updates = resolveMmpPropertyUpdate('colors', {
      background: '#ff0000',
      branch: '#00ff00',
      name: '#0000ff',
    });

    expect(updates).toEqual([
      { prop: 'backgroundColor', val: '#ff0000' },
      { prop: 'branchColor', val: '#00ff00' },
      { prop: 'nameColor', val: '#0000ff' },
    ]);
  });

  it('resolves compound property (font) via reverse mapping', () => {
    const updates = resolveMmpPropertyUpdate('font', {
      size: 20,
      weight: 'bold',
      style: 'italic',
    });

    expect(updates).toEqual(
      expect.arrayContaining([
        { prop: 'fontSize', val: 20 },
        { prop: 'fontWeight', val: 'bold' },
        { prop: 'fontStyle', val: 'italic' },
      ])
    );
  });

  it('returns empty array for unknown property keys', () => {
    const updates = resolveMmpPropertyUpdate('unknown_key', 'value');
    expect(updates).toEqual([]);
  });

  it('handles null compound value gracefully', () => {
    const updates = resolveCompoundMmpUpdates(
      { background: 'backgroundColor' },
      null as unknown as Record<string, unknown>
    );
    expect(updates).toEqual([]);
  });
});

// ─── Client color resolution ─────────────────────────────────

describe('client color resolution', () => {
  it('returns existing color when no collision', () => {
    const result = resolveClientColor(
      '#ff0000',
      new Set(['#00ff00', '#0000ff'])
    );
    expect(result).toBe('#ff0000');
  });

  it('generates a different valid hex color on collision', () => {
    const result = resolveClientColor('#00ff00', new Set(['#00ff00']));
    expect(result).toMatch(/^#(?!00ff00)[0-9a-f]{6}$/);
  });

  it('handles empty used colors set', () => {
    const result = resolveClientColor('#ff0000', new Set());
    expect(result).toBe('#ff0000');
  });
});

// ─── findAffectedNodes ───────────────────────────────────────

describe('findAffectedNodes', () => {
  it('collects node IDs from both old and new mappings', () => {
    const oldMapping = {
      c1: { nodeId: 'node-a', color: '#ff0000' },
      c2: { nodeId: 'node-b', color: '#00ff00' },
    };

    const newMapping = {
      c1: { nodeId: 'node-b', color: '#ff0000' },
      c3: { nodeId: 'node-c', color: '#0000ff' },
    };

    const result = findAffectedNodes(oldMapping, newMapping);

    expect(result).toEqual(new Set(['node-a', 'node-b', 'node-c']));
  });

  it('excludes empty nodeId strings', () => {
    const oldMapping = {
      c1: { nodeId: '', color: '#ff0000' },
    };

    const newMapping = {
      c1: { nodeId: 'node-a', color: '#ff0000' },
    };

    const result = findAffectedNodes(oldMapping, newMapping);

    expect(result).toEqual(new Set(['node-a']));
  });

  it('returns empty set when no nodes selected', () => {
    const oldMapping = {
      c1: { nodeId: '', color: '#ff0000' },
    };

    const newMapping = {
      c1: { nodeId: '', color: '#ff0000' },
    };

    const result = findAffectedNodes(oldMapping, newMapping);

    expect(result.size).toBe(0);
  });
});

// ─── sortParentFirst ─────────────────────────────────────────

describe('sortParentFirst', () => {
  it('places root node first when children appear before parent', () => {
    const child = createMockNode({
      id: 'child-1',
      parent: 'root-1',
      isRoot: false,
    });
    const root = createMockNode({ id: 'root-1', parent: '', isRoot: true });

    const result = sortParentFirst([child, root]);

    expect(result.map(n => n.id)).toEqual(['root-1', 'child-1']);
  });

  it('ensures grandchild nodes come after their parent', () => {
    const grandchild = createMockNode({
      id: 'gc-1',
      parent: 'child-1',
      isRoot: false,
    });
    const child = createMockNode({
      id: 'child-1',
      parent: 'root-1',
      isRoot: false,
    });
    const root = createMockNode({ id: 'root-1', parent: '', isRoot: true });

    const result = sortParentFirst([grandchild, child, root]);

    expect(result.map(n => n.id)).toEqual(['root-1', 'child-1', 'gc-1']);
  });

  it('handles already-sorted input without changing order', () => {
    const root = createMockNode({ id: 'root-1', parent: '', isRoot: true });
    const child1 = createMockNode({
      id: 'c1',
      parent: 'root-1',
      isRoot: false,
    });
    const child2 = createMockNode({
      id: 'c2',
      parent: 'root-1',
      isRoot: false,
    });

    const result = sortParentFirst([root, child1, child2]);

    expect(result.map(n => n.id)).toEqual(['root-1', 'c1', 'c2']);
  });

  it('returns original array when no root is found', () => {
    const node1 = createMockNode({ id: 'n1', parent: 'n2', isRoot: false });
    const node2 = createMockNode({ id: 'n2', parent: 'n1', isRoot: false });

    const result = sortParentFirst([node1, node2]);

    expect(result.map(n => n.id)).toEqual(['n1', 'n2']);
  });

  it('groups sibling nodes under their shared parent', () => {
    const root = createMockNode({ id: 'root', parent: '', isRoot: true });
    const b = createMockNode({ id: 'b', parent: 'root', isRoot: false });
    const a = createMockNode({ id: 'a', parent: 'root', isRoot: false });
    const bChild = createMockNode({
      id: 'b-child',
      parent: 'b',
      isRoot: false,
    });

    const result = sortParentFirst([bChild, a, b, root]);

    expect(result[0].id).toBe('root');
    expect(result.indexOf(b)).toBeLessThan(result.indexOf(bChild));
  });

  it('returns empty array for empty input', () => {
    const result = sortParentFirst([]);

    expect(result).toEqual([]);
  });

  it('appends orphaned nodes not reachable from root', () => {
    const root = createMockNode({ id: 'root', parent: '', isRoot: true });
    const child = createMockNode({
      id: 'child',
      parent: 'root',
      isRoot: false,
    });
    const orphan = createMockNode({
      id: 'orphan',
      parent: 'deleted-parent',
      isRoot: false,
    });

    const result = sortParentFirst([orphan, child, root]);

    expect(result.map(n => n.id)).toEqual(['root', 'child', 'orphan']);
  });
});

// ─── collectDescendantIds ────────────────────────────────────

describe('collectDescendantIds', () => {
  let doc: Y.Doc;
  let nodesMap: Y.Map<Y.Map<unknown>>;

  function addNode(id: string, parent: string | null): void {
    const yNode = new Y.Map<unknown>();
    populateYMapFromNodeProps(
      yNode,
      createMockNode({ id, parent, isRoot: !parent })
    );
    nodesMap.set(id, yNode);
  }

  beforeEach(() => {
    doc = new Y.Doc();
    nodesMap = doc.getMap('nodes') as Y.Map<Y.Map<unknown>>;
  });

  afterEach(() => {
    doc.destroy();
  });

  it('collects direct children of deleted node', () => {
    addNode('root', null);
    addNode('A', 'root');
    addNode('B', 'A');

    const result = collectDescendantIds(nodesMap, 'A');

    expect(result).toEqual(['B']);
  });

  it('collects all nested descendants (A=>B=>C, delete A)', () => {
    addNode('root', null);
    addNode('A', 'root');
    addNode('B', 'A');
    addNode('C', 'B');

    const result = collectDescendantIds(nodesMap, 'A');

    expect(result).toEqual(['B', 'C']);
  });

  it('collects multi-branch descendants', () => {
    addNode('root', null);
    addNode('B', 'root');
    addNode('C1', 'B');
    addNode('C2', 'B');
    addNode('D', 'C1');

    const result = collectDescendantIds(nodesMap, 'B');

    expect(result).toEqual(expect.arrayContaining(['C1', 'C2', 'D']));
    expect(result).toHaveLength(3);
  });

  it('returns empty array for leaf node', () => {
    addNode('root', null);
    addNode('A', 'root');

    const result = collectDescendantIds(nodesMap, 'A');

    expect(result).toEqual([]);
  });

  it('returns empty array for non-existent node', () => {
    addNode('root', null);

    const result = collectDescendantIds(nodesMap, 'nonexistent');

    expect(result).toEqual([]);
  });

  it('collects all nodes when starting from root', () => {
    addNode('root', null);
    addNode('A', 'root');
    addNode('B', 'root');
    addNode('C', 'A');

    const result = collectDescendantIds(nodesMap, 'root');

    expect(result).toEqual(expect.arrayContaining(['A', 'B', 'C']));
    expect(result).toHaveLength(3);
  });

  it('handles cycles without infinite loop', () => {
    addNode('root', null);
    addNode('A', 'root');
    addNode('B', 'A');
    // Create cycle: make A point to B
    nodesMap.get('A')!.set('parent', 'B');

    const result = collectDescendantIds(nodesMap, 'A');

    expect(result).toEqual(['B']);
  });
});
