import * as v from 'valibot';
import type { MapNode } from '../models';
import { readFixture } from './fixtures/readFixture';
import {
  acceptedArrows,
  arrowVerdicts,
  LoadableNodeSchema,
  MapFileError,
  MapFileNodeSchemas,
  parseMapFile,
  readMapFileLayout,
  repairOrphanedNodes,
  withMainRoot,
} from './mapFile';

function node(id: string, parent: string | null, isRoot = false): MapNode {
  return { id, parent, k: 1, name: id, isRoot };
}

const NODES = [node('root', null, true), node('a', 'root'), node('b', 'root')];

describe('parseMapFile', () => {
  it('reads a version 1 node list, whose nodes lack link and isRoot', () => {
    const file = parseMapFile(readFixture('v1-node-list.json'));

    expect(file.version).toBe(1);
    expect(file.nodes.map(n => n.name)).toEqual([
      'Version 1 root',
      'Version 1 child',
    ]);
    expect(file.arrows).toEqual([]);
  });

  it('reads a version 1 node list whose nodes lack coordinates, as the Mermaid import writes it', () => {
    const [root, child] = JSON.parse(readFixture('v1-node-list.json'));
    delete root.coordinates;
    delete child.coordinates;

    const file = parseMapFile(JSON.stringify([root, child]));

    expect(file.nodes).toHaveLength(2);
  });

  it('rejects a version 2 node without coordinates', () => {
    const file = JSON.parse(readFixture('v2.json'));
    delete file.nodes[1].coordinates;

    expect(() => parseMapFile(JSON.stringify(file))).toThrow(MapFileError);
  });

  it('drops the node fields no version knows', () => {
    const [root] = parseMapFile(readFixture('v1-node-list.json')).nodes;

    expect(root).not.toHaveProperty('locked');
  });

  it('reads an export object without a version field as version 2', () => {
    const file = parseMapFile(readFixture('v2-unversioned.json'));

    expect(file.version).toBe(2);
    expect(file.nodes).toHaveLength(3);
    expect(file.arrows).toHaveLength(1);
  });

  it('reads a version 2 file', () => {
    const file = parseMapFile(readFixture('v2.json'));

    expect(file.version).toBe(2);
    expect(file.nodes.map(n => n.isRoot)).toEqual([true, false, false]);
    expect(file.arrows).toHaveLength(1);
  });

  // The map loader puts the configured default in place of a dropped color.
  it('drops the rgb colors of a version 2 file and keeps the hex colors', () => {
    const [root, child] = parseMapFile(readFixture('v2-rgb-colors.json')).nodes;

    expect(root.colors).toEqual({ branch: '' });
    expect(child.colors).toEqual({ name: '#787878', background: '#f0f6f5' });
  });

  it('drops the rgb colors of a version 1 node list', () => {
    const [root, child] = JSON.parse(readFixture('v1-node-list.json'));
    root.colors.background = 'rgba(139,195,74,0.44)';

    const file = parseMapFile(JSON.stringify([root, child]));

    expect(file.nodes[0].colors?.background).toBeUndefined();
  });

  it.each(['red', 'rgba(300,0,0,1)', '#ff00', 42])(
    'drops the color %p, which is no hex color',
    color => {
      const file = JSON.parse(readFixture('v2.json'));
      file.nodes[0].colors.background = color;

      const [root] = parseMapFile(JSON.stringify(file)).nodes;

      expect(root.colors?.background).toBeUndefined();
    }
  );

  it('passes every arrow entry on unchecked, for the loader to filter', () => {
    const file = parseMapFile(readFixture('warnings.json'));

    expect(file.arrows).toHaveLength(3);
  });

  it.each([
    ['invalid-v2-incomplete-node.json', /version 2 schema/],
    ['invalid-newer-version.json', /newer release/],
    ['invalid-version-string.json', /needs the version 2/],
    ['invalid-node-values.json', /version 2 schema/],
  ])('rejects %s', (fixture, reason) => {
    expect(() => parseMapFile(readFixture(fixture))).toThrow(MapFileError);
    expect(() => parseMapFile(readFixture(fixture))).toThrow(reason);
  });

  it('rejects a node id that is no UUID', () => {
    const file = JSON.parse(readFixture('v2.json'));
    file.nodes[1].id = 'child';

    expect(() => parseMapFile(JSON.stringify(file))).toThrow('no UUID');
  });

  it('throws for a file that holds neither a node list nor an export object', () => {
    expect(() => parseMapFile('"text"')).toThrow(MapFileError);
  });

  it('throws for text that is no JSON', () => {
    expect(() => parseMapFile('{')).toThrow(SyntaxError);
  });

  /** The `path` of the MapFileError that parseMapFile throws for the text. */
  function rejectedPath(json: string): string {
    try {
      parseMapFile(json);
    } catch (error) {
      if (error instanceof MapFileError) return error.path;
      throw error;
    }
    throw new Error('parseMapFile accepted the file');
  }

  it.each([
    ['invalid-newer-version.json', 'version'],
    ['invalid-version-string.json', 'version'],
    ['invalid-v2-incomplete-node.json', 'nodes'],
    ['invalid-node-values.json', 'nodes'],
  ])('names the field at fault in %s: %s', (fixture, path) => {
    expect(rejectedPath(readFixture(fixture))).toBe(path);
  });

  it('names the nodes as the field at fault for a node id that is no UUID', () => {
    const file = JSON.parse(readFixture('v2.json'));
    file.nodes[1].id = 'child';

    expect(rejectedPath(JSON.stringify(file))).toBe('nodes');
  });

  it('names the file as the field at fault for an unknown layout', () => {
    expect(rejectedPath('"text"')).toBe('file');
  });
});

describe('MapFileError', () => {
  it('marks a file from a newer release', () => {
    expect(new MapFileError('version', 'newer', true).fromNewerRelease).toBe(
      true
    );
  });

  it('marks no other rejection as from a newer release', () => {
    expect(new MapFileError('version', 'string').fromNewerRelease).toBe(false);
  });
});

describe('LoadableNodeSchema', () => {
  it('accepts a version 1 node, which lacks link and isRoot', () => {
    const [v1Node] = JSON.parse(readFixture('v1-node-list.json'));

    expect(v.is(LoadableNodeSchema, v1Node)).toBe(true);
  });

  it('accepts a version 2 node', () => {
    const [v2Node] = JSON.parse(readFixture('v2.json')).nodes;

    expect(v.is(LoadableNodeSchema, v2Node)).toBe(true);
  });

  it('rejects a node without an id', () => {
    expect(v.is(LoadableNodeSchema, { name: 'no id' })).toBe(false);
  });

  // The loader stores the nodes as they come, so only parseMapFile converts.
  it('rejects an rgb color, which only the map file import converts', () => {
    const [v2Node] = JSON.parse(readFixture('v2-rgb-colors.json')).nodes;

    expect(v.is(LoadableNodeSchema, v2Node)).toBe(false);
  });

  /** A file of each map file version, read through parseMapFile. */
  const FIXTURE_OF_VERSION: Record<string, string> = {
    1: 'v1-node-list.json',
    2: 'v2.json',
  };

  it('has a fixture for every map file version', () => {
    expect(Object.keys(FIXTURE_OF_VERSION)).toEqual(
      Object.keys(MapFileNodeSchemas)
    );
  });

  it.each(Object.entries(FIXTURE_OF_VERSION))(
    'accepts every node of the version %s fixture',
    (_version, fixture) => {
      const { nodes } = parseMapFile(readFixture(fixture));

      expect(nodes.every(node => v.is(LoadableNodeSchema, node))).toBe(true);
    }
  );
});

describe('readMapFileLayout', () => {
  it('reads a bare node list as version 1 with no declared version', () => {
    const result = readMapFileLayout(NODES);

    expect(result.ok && result.layout.version).toBe(1);
    expect(result.ok && result.layout.versionDeclared).toBe(false);
  });

  it('marks a declared version', () => {
    const result = readMapFileLayout({ version: 2, nodes: NODES });

    expect(result.ok && result.layout.versionDeclared).toBe(true);
  });

  it('lists the top-level fields the import ignores', () => {
    const result = readMapFileLayout({ nodes: NODES, title: 'x' });

    expect(result.ok && result.layout.ignoredFields).toEqual(['title']);
  });

  it('marks an arrows field that holds no list', () => {
    const result = readMapFileLayout({ nodes: NODES, arrows: 'none' });

    expect(result.ok && result.layout.arrowsIgnored).toBe(true);
  });

  it.each([1, 2.5, '2', null])(
    'rejects the version %p on an object',
    version => {
      const result = readMapFileLayout({ version, nodes: NODES });

      expect(result.ok || result.path).toBe('version');
    }
  );
});

describe('withMainRoot', () => {
  it('marks the first root node when no node carries isRoot', () => {
    const nodes = [node('a', 'b'), node('b', null), node('c', null)];

    expect(withMainRoot(nodes).map(n => n.isRoot)).toEqual([
      false,
      true,
      false,
    ]);
  });

  it('keeps an existing main root', () => {
    const nodes = [node('a', null), node('b', null, true)];

    expect(withMainRoot(nodes).map(n => n.isRoot)).toEqual([false, true]);
  });
});

describe('repairOrphanedNodes', () => {
  const parents = (nodes: MapNode[]) => nodes.map(n => n.parent);

  it('clears a missing parent and keeps the nodes below in the tree', () => {
    const nodes = [node('root', null, true), node('a', 'gone'), node('b', 'a')];

    const repaired = repairOrphanedNodes(nodes);

    expect(repaired.map(n => n.id)).toEqual(['a']);
    expect(parents(nodes)).toEqual([null, null, 'a']);
  });

  it('clears the parent of a self-referencing node', () => {
    const nodes = [node('root', null, true), node('a', 'a')];

    expect(repairOrphanedNodes(nodes).map(n => n.id)).toEqual(['a']);
    expect(parents(nodes)).toEqual([null, null]);
  });

  it('clears the parent of the first cycle node in list order and keeps the rest of the cycle below it', () => {
    const nodes = [
      node('root', null, true),
      node('a', 'b'),
      node('b', 'c'),
      node('c', 'b'),
    ];

    expect(repairOrphanedNodes(nodes).map(n => n.id)).toEqual(['b']);
    expect(parents(nodes)).toEqual([null, 'b', null, 'b']);
  });

  it('clears the parent of the main root when the main root is in a parent cycle', () => {
    const nodes = [node('b', 'a'), node('a', 'b', true)];

    expect(repairOrphanedNodes(nodes).map(n => n.id)).toEqual(['a']);
    expect(parents(nodes)).toEqual(['a', null]);
  });

  it('repairs a map whose nodes all form one cycle', () => {
    const nodes = [node('a', 'b'), node('b', 'a')];

    expect(repairOrphanedNodes(nodes).map(n => n.id)).toEqual(['a']);
  });

  it('changes nothing in a list without orphaned nodes', () => {
    const nodes = [...NODES.map(n => ({ ...n }))];

    expect(repairOrphanedNodes(nodes)).toEqual([]);
    expect(nodes).toEqual(NODES);
  });

  it('marks the main root before the repair when no node carries isRoot', () => {
    const nodes = [node('a', 'gone'), node('root', null)];

    repairOrphanedNodes(nodes);

    expect(nodes.map(n => n.isRoot)).toEqual([false, true]);
  });
});

describe('parseMapFile with orphaned nodes', () => {
  it('repairs the orphaned nodes and counts them', () => {
    const file = JSON.parse(readFixture('v2.json'));
    file.nodes[1].parent = '00000000-0000-4000-8000-0000000000ff';

    const { nodes, repairedNodes } = parseMapFile(JSON.stringify(file));

    expect(nodes[1].parent).toBeNull();
    expect(repairedNodes).toBe(1);
  });

  it('counts no repaired node in a file without orphaned nodes', () => {
    expect(parseMapFile(readFixture('v2.json')).repairedNodes).toBe(0);
  });
});

describe('arrowVerdicts', () => {
  it('names the reason for each dropped entry, in file order', () => {
    const entries = [
      { source: 'a', target: 'b' },
      { source: 'a', target: 'b' },
      { source: 'a', target: 'a' },
      { source: 'a', target: 'gone' },
      { source: 'a', target: 'root' },
      7,
    ];

    expect(arrowVerdicts(NODES, entries)).toEqual([
      null,
      'duplicate',
      'self',
      'missing',
      'parent',
      'invalid',
    ]);
  });
});

describe('acceptedArrows', () => {
  it('keeps the accepted entries without extra fields', () => {
    const entries = [{ source: 'a', target: 'b', color: 'red' }, null];

    expect(acceptedArrows(NODES, entries)).toEqual([
      { source: 'a', target: 'b' },
    ]);
  });
});
