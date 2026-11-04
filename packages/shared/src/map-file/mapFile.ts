import * as v from 'valibot';
import { canConnect } from '../algorithms/arrows';
import type { TreeNodeLike } from '../algorithms/tree';
import { MAP_FILE_VERSION } from '../constants';
import {
  ArrowSchema,
  CoordinatesSchema,
  LinkSchema,
  NodeSchema,
} from '../schemas';
import type { ArrowRefusal, MapArrow, MapExport, MapSnapshot } from '../models';
import { isRecord } from './isRecord';

/** The map file versions this release reads. */
export type MapFileVersion = 1 | 2;

/**
 * A node of a version 1 file, the bare node list of older releases. Those
 * releases wrote no link and no isRoot attribute. The Mermaid import writes
 * this layout too, without coordinates, and the map service lays out a node
 * that has none.
 */
export const MapFileV1NodeSchema = v.object({
  ...NodeSchema.entries,
  coordinates: v.optional(CoordinatesSchema),
  link: v.optional(LinkSchema),
  isRoot: v.optional(v.boolean()),
});

/** The node schema of each map file version. */
export const MapFileNodeSchemas = {
  1: MapFileV1NodeSchema,
  2: NodeSchema,
} as const satisfies Record<MapFileVersion, v.GenericSchema>;

/**
 * A node the map loader accepts, from a file of any version this release
 * reads. Every later version so far only requires more fields than version 1,
 * so the version 1 schema accepts them all. A version that drops or retypes a
 * version 1 field needs a union here.
 */
export const LoadableNodeSchema = MapFileV1NodeSchema;

/** Every node id in a map file is a UUID. */
export const MapFileNodeIdSchema = v.pipe(v.string(), v.uuid());

/** The checked content of a map file, ready for the map loader. */
export type MapFile = Omit<MapExport, 'version' | 'arrows'> & {
  version: MapFileVersion;
  /** The arrow entries, unchecked: the loader filters them against the nodes. */
  arrows: unknown[];
};

/** How a JSON file lays out its map, before any node check. */
export interface MapFileLayout {
  version: MapFileVersion;
  /** False when the file has no version field, so the import reads the version from the layout. */
  versionDeclared: boolean;
  nodes: unknown[];
  arrows: unknown[];
  /** The top-level fields of an export object the import ignores. */
  ignoredFields: string[];
  /** Whether an `arrows` field exists but holds no list. */
  arrowsIgnored: boolean;
}

/** Why the import rejects a file, and the field at fault. */
export interface MapFileRejection {
  ok: false;
  path: 'file' | 'version';
  reason: string;
  /** Whether a newer release wrote the file, so a later import may succeed. */
  fromNewerRelease: boolean;
}

/** A layout, or the reason the import rejects the file. */
export type MapFileLayoutResult =
  { ok: true; layout: MapFileLayout } | MapFileRejection;

/** The part of a map file that makes the import reject it. */
export type MapFileErrorPath = MapFileRejection['path'] | 'nodes';

/** Thrown by `parseMapFile`, with the reason the import rejects the file. */
export class MapFileError extends Error {
  constructor(
    readonly path: MapFileErrorPath,
    reason: string,
    readonly fromNewerRelease = false
  ) {
    super(reason);
    this.name = 'MapFileError';
  }
}

const EXPORT_FIELDS = ['version', 'nodes', 'arrows'];

/**
 * The version of an export object. A missing field reads as 2, the layout
 * releases wrote before the field existed.
 */
function exportVersion(version: unknown): MapFileRejection | 2 {
  if (version === undefined || version === MAP_FILE_VERSION) return 2;
  const fromNewerRelease =
    Number.isInteger(version) && Number(version) > MAP_FILE_VERSION;
  const reason = fromNewerRelease
    ? `The file has version ${version}, which a newer release wrote; this release reads versions 1 and 2.`
    : `An export object needs the version 2, but the file holds ${JSON.stringify(version)}. Version 1 files are bare node lists.`;
  return { ok: false, path: 'version', reason, fromNewerRelease };
}

/**
 * Read the layout of the parsed content of a JSON file. A bare node list is
 * version 1 and holds no arrows. An object with a `nodes` list is version 2.
 * An `arrows` field that is no list imports no arrows.
 */
export function readMapFileLayout(parsed: unknown): MapFileLayoutResult {
  if (Array.isArray(parsed)) {
    const layout: MapFileLayout = {
      version: 1,
      versionDeclared: false,
      nodes: parsed,
      arrows: [],
      ignoredFields: [],
      arrowsIgnored: false,
    };
    return { ok: true, layout };
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.nodes)) {
    const reason =
      'The file holds neither a node list nor an object with a `nodes` list.';
    return { ok: false, path: 'file', reason, fromNewerRelease: false };
  }
  const version = exportVersion(parsed.version);
  if (version !== 2) return version;

  const { arrows } = parsed;
  const layout: MapFileLayout = {
    version,
    versionDeclared: parsed.version !== undefined,
    nodes: parsed.nodes,
    arrows: Array.isArray(arrows) ? arrows : [],
    ignoredFields: Object.keys(parsed).filter(k => !EXPORT_FIELDS.includes(k)),
    arrowsIgnored: arrows !== undefined && !Array.isArray(arrows),
  };
  return { ok: true, layout };
}

/** Checks every node against the schema of the file's version. */
function checkedNodes({ version, nodes }: MapFileLayout): MapSnapshot {
  const result = v.safeParse(v.array(MapFileNodeSchemas[version]), nodes);
  if (!result.success) {
    const [issue] = result.issues;
    throw new MapFileError(
      'nodes',
      `A node fails the version ${version} schema: ${issue.message}`
    );
  }
  const badId = result.output.find(node => !v.is(MapFileNodeIdSchema, node.id));
  if (badId) {
    throw new MapFileError('nodes', `The node id "${badId.id}" is no UUID.`);
  }
  return result.output;
}

/**
 * Read the text of a JSON file into the nodes and arrows to import. Throws
 * for text that is no JSON, and a `MapFileError` for a layout or a node the
 * file's version rejects.
 */
export function parseMapFile(json: string): MapFile {
  const result = readMapFileLayout(JSON.parse(json));
  if (!result.ok) {
    throw new MapFileError(result.path, result.reason, result.fromNewerRelease);
  }
  const { layout } = result;
  return {
    version: layout.version,
    nodes: checkedNodes(layout),
    arrows: layout.arrows,
  };
}

/**
 * The nodes with a main root. A map that names none makes the first node
 * without a parent, in the order of the exported map, its main root, so the
 * load centers and selects it and peers see a replacement. Changes the nodes
 * in place.
 */
export function withMainRoot<T extends TreeNodeLike>(nodes: T[]): T[] {
  if (nodes.some(node => node.isRoot)) return nodes;

  const root = nodes.find(node => !node.parent);
  if (root) root.isRoot = true;
  return nodes;
}

/** Why the import drops an arrow entry: its shape, or an endpoint rule. */
export type ImportedArrowRefusal = ArrowRefusal | 'invalid';

/**
 * The verdict on each arrow entry, in file order: null for an arrow the
 * import keeps, else the reason it drops the entry. Each entry is checked
 * against the nodes and the arrows kept before it, so a repeated arrow drops.
 */
export function arrowVerdicts(
  nodes: readonly TreeNodeLike[],
  arrows: readonly unknown[]
): (ImportedArrowRefusal | null)[] {
  return sortArrows(nodes, arrows).verdicts;
}

/** The arrow entries `arrowVerdicts` keeps, with no extra fields. */
export function acceptedArrows(
  nodes: readonly TreeNodeLike[],
  arrows: readonly unknown[]
): MapArrow[] {
  return sortArrows(nodes, arrows).accepted;
}

/** Checks each arrow entry once, keeping the verdicts and the kept arrows. */
function sortArrows(
  nodes: readonly TreeNodeLike[],
  arrows: readonly unknown[]
): { verdicts: (ImportedArrowRefusal | null)[]; accepted: MapArrow[] } {
  const accepted: MapArrow[] = [];
  const verdicts = arrows.map(arrow => {
    if (!v.is(ArrowSchema, arrow)) return 'invalid';
    const { source, target } = arrow;
    const refusal = canConnect(nodes, accepted, source, target);
    if (refusal === null) accepted.push({ source, target });
    return refusal;
  });
  return { verdicts, accepted };
}
