import { ExportNodeProperties } from '@teammapper/shared';
import { parseMapFile } from './map-import';

function node(id: string, parent: string | null): ExportNodeProperties {
  return { id, parent, name: id, isRoot: parent === null } as never;
}

const NODES = [node('root', null), node('a', 'root'), node('b', 'root')];

describe('parseMapFile', () => {
  it('reads the nodes and arrows of an export object', () => {
    const file = { nodes: NODES, arrows: [{ source: 'a', target: 'b' }] };

    expect(parseMapFile(JSON.stringify(file))).toEqual(file);
  });

  it('reads a bare node list of an older version as a map with no arrows', () => {
    expect(parseMapFile(JSON.stringify(NODES))).toEqual({
      nodes: NODES,
      arrows: [],
    });
  });

  it('reads an export object without arrows as a map with no arrows', () => {
    expect(parseMapFile(JSON.stringify({ nodes: NODES })).arrows).toEqual([]);
  });

  it('passes every arrow entry on unchecked, for the loader to filter', () => {
    const entries = [
      { source: 'a', target: 'gone' },
      { source: 'a', target: 'a' },
      { source: 'a', target: 'b' },
      { source: 'a', target: 'b' },
      7,
      null,
    ];
    const file = { nodes: NODES, arrows: entries };

    expect(parseMapFile(JSON.stringify(file)).arrows).toEqual(entries);
  });

  it('reads no arrows when the arrows field is no list', () => {
    const file = { nodes: NODES, arrows: 'none' };

    expect(parseMapFile(JSON.stringify(file)).arrows).toEqual([]);
  });

  it('throws for a file that holds neither a node list nor an export object', () => {
    expect(() => parseMapFile('"text"')).toThrow();
  });

  it('throws for text that is no JSON', () => {
    expect(() => parseMapFile('{')).toThrow();
  });
});
