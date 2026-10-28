import { MapExport, MapSnapshot } from '@teammapper/shared';

/**
 * The content of an imported JSON file. The nodes and arrow entries stay
 * unchecked: the map loader validates the nodes, then the arrows against
 * them.
 */
export type MapFile = Omit<MapExport, 'arrows'> & { arrows: unknown[] };

/**
 * Read the text of a JSON file into the nodes and arrows to import. The file
 * holds either an export object, `{ nodes, arrows }`, or the bare node list
 * older versions wrote, which imports with no arrows. An `arrows` field that
 * is no list imports no arrows. Throws for any other content.
 */
export function parseMapFile(json: string): MapFile {
  const parsed: unknown = JSON.parse(json);
  if (Array.isArray(parsed)) return { nodes: parsed, arrows: [] };
  if (isExportObject(parsed)) {
    const { nodes, arrows } = parsed;
    return { nodes, arrows: Array.isArray(arrows) ? arrows : [] };
  }
  throw new Error('The file holds no node list and no export object');
}

/**
 * Whether the value is an object with a node list, with or without arrows.
 * The check reads the envelope only; the map loader validates each node.
 */
function isExportObject(
  value: unknown
): value is { nodes: MapSnapshot; arrows?: unknown } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'nodes' in value &&
    Array.isArray(value.nodes)
  );
}
