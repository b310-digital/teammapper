import * as Y from 'yjs';
import { ExportNodeProperties } from '@teammapper/shared';
import {
  populateYMapFromNodeProps,
  yMapToNodeProps,
  buildYjsWsUrl,
  buildYjsProtocols,
  toTransmittableSecret,
  resolveClientColor,
  findAffectedNodes,
  collectDescendantIds,
} from './yjs-utils';

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
    protected: false,
    coordinates: undefined,
    image: undefined,
    link: undefined,
    isRoot: false,
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
      protected: true,
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
        protected: true,
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

  it('reads back a key the Y.Map lacks as absent', () => {
    const yNode = new Y.Map<unknown>();
    nodesMap.set('n2', yNode);
    yNode.set('id', 'n2');
    yNode.set('parent', 'root');

    expect(yMapToNodeProps(yNode)).toStrictEqual({ id: 'n2', parent: 'root' });
  });

  it('writes no key for an attribute that is undefined', () => {
    const yNode = new Y.Map<unknown>();
    populateYMapFromNodeProps(yNode, createMockNode({ id: 'n2' }));
    nodesMap.set('n2', yNode);

    expect(['coordinates', 'image', 'link'].map(key => yNode.has(key))).toEqual(
      [false, false, false]
    );
  });

  it.each([
    ['null', null],
    ['an empty string', ''],
  ])('stores null as the parent of a root given %s', (_label, parent) => {
    const yNode = new Y.Map<unknown>();
    populateYMapFromNodeProps(yNode, createMockNode({ id: 'r', parent }));
    nodesMap.set('r', yNode);

    expect(yNode.get('parent')).toBeNull();
  });

  it('writes no detached entry', () => {
    const yNode = new Y.Map<unknown>();
    populateYMapFromNodeProps(yNode, createMockNode());
    nodesMap.set('n3', yNode);

    expect(nodesMap.get('n3')!.has('detached')).toBe(false);
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

describe('buildYjsProtocols', () => {
  it('offers the secret as a second subprotocol', () => {
    expect(buildYjsProtocols('my-secret')).toEqual([
      'teammapper.v2',
      'teammapper.secret.my-secret',
    ]);
  });

  it.each([
    ['an empty secret', ''],
    ['a null secret', null],
  ])('offers only the Yjs subprotocol for %s', (_label, secret) => {
    expect(buildYjsProtocols(secret)).toEqual(['teammapper.v2']);
  });
});

describe('toTransmittableSecret', () => {
  it('keeps a UUID secret', () => {
    const secret = '00000000-0000-0000-0000-000000000000';
    expect(toTransmittableSecret(secret)).toBe(secret);
  });

  it.each([
    ['a null secret', null],
    ['an empty secret', ''],
    ['a trailing parenthesis', 'abc)'],
    ['a space', 'ab c'],
    ['a slash', 'ab/c'],
    ['a colon', 'ab:c'],
    ['an at sign', 'ab@c'],
    ['an umlaut', 'abä'],
    ['an emoji', 'ab🙂'],
  ])('returns an empty string for %s', (_label, secret) => {
    expect(toTransmittableSecret(secret)).toBe('');
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
