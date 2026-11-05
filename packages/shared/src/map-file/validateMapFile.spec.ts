import type { MapNode } from '../models';
import { readFixture } from './fixtures/readFixture';
import { validateMapFile } from './validateMapFile';
import type { MapFileReport } from './validateMapFile';

/** Each finding as `<severity> <path>`, in report order. */
const summary = (report: MapFileReport) =>
  report.findings.map(f => `${f.severity} ${f.path}`);

const reasons = (report: MapFileReport) => report.findings.map(f => f.reason);

/** Short names for the node ids of the inline maps, which must be UUIDs. */
const IDS: Record<string, string> = {
  root: '00000000-0000-4000-8000-000000000001',
  a: '00000000-0000-4000-8000-00000000000a',
  b: '00000000-0000-4000-8000-00000000000b',
  c: '00000000-0000-4000-8000-00000000000c',
  gone: '00000000-0000-4000-8000-0000000000ff',
};

function node(id: string, parent: string | null, isRoot = false): MapNode {
  return {
    id: IDS[id],
    parent: parent && IDS[parent],
    isRoot,
    k: 1,
    name: id,
    coordinates: { x: 0, y: 0 },
    colors: { name: '#000000', background: '#ffffff', branch: '' },
    font: { size: 20, style: 'normal', weight: 'normal' },
    image: { src: '', size: 60 },
    link: { href: '' },
    protected: false,
  };
}

const validate = (nodes: MapNode[]) =>
  validateMapFile(JSON.stringify({ version: 2, nodes, arrows: [] }));

describe('validateMapFile with the fixtures', () => {
  it('warns about each rgb color, which the import replaces with the default', () => {
    const report = validateMapFile(readFixture('v2-rgb-colors.json'));

    expect(summary(report)).toEqual([
      'warning nodes[0].colors.name',
      'warning nodes[0].colors.background',
      'warning nodes[1].colors.branch',
    ]);
    expect(reasons(report)[0]).toContain('default color');
  });

  it('reads a version 1 node list and warns about what the import changes', () => {
    const report = validateMapFile(readFixture('v1-node-list.json'));

    expect(report.version).toBe(1);
    expect(report.versionDeclared).toBe(false);
    expect(summary(report)).toEqual([
      'warning nodes[0].locked',
      'warning nodes[1].locked',
      'warning nodes',
    ]);
    expect(reasons(report)[2]).toContain('makes nodes[0] the main root');
  });

  it('reads an export object without a version field as version 2', () => {
    const report = validateMapFile(readFixture('v2-unversioned.json'));

    expect(report).toEqual({
      version: 2,
      versionDeclared: false,
      findings: [],
    });
  });

  it('finds nothing in a version 2 file', () => {
    const report = validateMapFile(readFixture('v2.json'));

    expect(report).toEqual({ version: 2, versionDeclared: true, findings: [] });
  });

  it('requires link and isRoot on every version 2 node', () => {
    const report = validateMapFile(
      readFixture('invalid-v2-incomplete-node.json')
    );

    expect(summary(report)).toEqual([
      'error nodes[0].link',
      'error nodes[0].isRoot',
      'error nodes',
      'warning nodes',
    ]);
  });

  it('rejects a version from a newer release', () => {
    const report = validateMapFile(readFixture('invalid-newer-version.json'));

    expect(report.version).toBeNull();
    expect(summary(report)).toEqual(['error version']);
    expect(reasons(report)[0]).toContain('newer release');
  });

  it('rejects a version that is no integer', () => {
    const report = validateMapFile(readFixture('invalid-version-string.json'));

    expect(summary(report)).toEqual(['error version']);
  });

  it('reports each bad node value with its path', () => {
    const report = validateMapFile(readFixture('invalid-node-values.json'));

    expect(summary(report)).toEqual([
      'error nodes[0].link.href',
      'error nodes[0].id',
      'error nodes',
      'warning nodes[0].colors.background',
    ]);
  });

  it('warns about ignored fields, repaired orphaned nodes and dropped arrows', () => {
    const report = validateMapFile(readFixture('warnings.json'));

    expect(summary(report)).toEqual([
      'warning title',
      'warning nodes[0].hidden',
      'warning nodes[1].parent',
      'warning arrows[0]',
      'warning arrows[1]',
      'warning arrows[2]',
      'warning arrows[2]',
    ]);
    expect(reasons(report)[2]).toContain('starts a tree of its own');
  });
});

describe('validateMapFile', () => {
  it('reports text that is no JSON', () => {
    expect(summary(validateMapFile('{'))).toEqual(['error file']);
  });

  it('reports content that holds no node list', () => {
    expect(summary(validateMapFile('{"title":"x"}'))).toEqual(['error file']);
  });

  it('reports a repeated id', () => {
    const nodes = [
      node('root', null, true),
      node('a', 'root'),
      node('a', 'root'),
    ];

    expect(summary(validate(nodes))).toEqual(['error nodes[2].id']);
  });

  it('reports a main root that has a parent', () => {
    const nodes = [node('root', null), node('a', 'root', true)];

    expect(summary(validate(nodes))).toEqual(['error nodes[1].isRoot']);
  });

  it('warns about the main root when every node is in a parent cycle', () => {
    const nodes = [node('b', 'a'), node('a', 'b', true)];

    expect(summary(validate(nodes))).toEqual(['warning nodes[1].parent']);
  });

  it('warns about a main root whose parent is missing, which the import repairs', () => {
    const nodes = [node('root', 'gone', true), node('a', 'root')];

    expect(summary(validate(nodes))).toEqual(['warning nodes[0].parent']);
  });

  it('warns once per parent cycle', () => {
    const nodes = [
      node('root', null, true),
      node('a', 'b'),
      node('b', 'c'),
      node('c', 'b'),
    ];
    const report = validate(nodes);

    expect(summary(report)).toEqual(['warning nodes[2].parent']);
    expect(reasons(report)[0]).toContain('part of a parent cycle');
  });

  it('warns about a self-referencing node', () => {
    const nodes = [node('root', null, true), node('a', 'a')];
    const report = validate(nodes);

    expect(summary(report)).toEqual(['warning nodes[1].parent']);
    expect(reasons(report)[0]).toContain('is its own parent');
  });

  it('warns only about the top of a chain below a missing parent', () => {
    const nodes = [
      node('root', null, true),
      node('a', 'gone'),
      node('b', 'a'),
      node('c', 'b'),
    ];
    const report = validate(nodes);

    expect(summary(report)).toEqual(['warning nodes[1].parent']);
    expect(reasons(report)[0]).toContain(`No node has the id "${IDS.gone}"`);
  });

  it('warns about fields inside a node attribute group, which the import drops', () => {
    const root = node('root', null, true);
    const nodes = [
      {
        ...root,
        font: { ...root.font, family: 'serif' },
        coordinates: { x: 0, y: 0, z: 1 },
      },
    ];

    expect(summary(validate(nodes))).toEqual([
      'warning nodes[0].coordinates.z',
      'warning nodes[0].font.family',
    ]);
  });

  it('keeps the child nodes of a node that fails the schema out of the orphans', () => {
    const root = { ...node('root', null, true), k: 'one' };
    const report = validateMapFile(
      JSON.stringify({ version: 2, nodes: [root, node('a', 'root')] })
    );

    expect(summary(report)).toEqual(['error nodes[0].k', 'error nodes']);
  });
});
