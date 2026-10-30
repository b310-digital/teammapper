import * as Y from 'yjs';
import {
  DEFAULT_ROOT_COLOR_BACKGROUND,
  DEFAULT_ROOT_COLOR_NAME,
  DEFAULT_ROOT_FONT_SIZE,
  DEFAULT_ROOT_FONT_STYLE,
  DEFAULT_ROOT_FONT_WEIGHT,
  DEFAULT_ROOT_NAME,
  MapArrow,
  MapNode,
  MapOptions,
  normalizeMapNode,
  UserMapOptions,
} from '@teammapper/shared';
import { v4 as uuidv4 } from 'uuid';
import {
  arrowEntries,
  arrowsMapOf,
  nodeEntries,
  nodesMapOf,
  populateYMapFromNodeProps,
  yMapToNodeProps,
} from '../../map-sync/yjs-utils';
import { DocPersistence } from './doc-persistence';
import {
  MapFormat,
  mapFormatNumber,
  NewerMapFormatError,
  pendingMigrations,
  stampFormatNumber,
} from './map-format';

/** The content of a map as its Y.Doc holds it. */
export interface MapContent {
  data: MapNode[];
  arrows: MapArrow[];
  options: MapOptions;
}

const MAP_OPTION_KEYS = [
  'fontMaxSize',
  'fontMinSize',
  'fontIncrement',
] as const;

/**
 * The root node of a new map, with the defaults the backend fills in for a
 * value the settings leave empty.
 */
export function newRootNode(settings: UserMapOptions['rootNode']): MapNode {
  return {
    id: uuidv4(),
    parent: null,
    k: 1,
    isRoot: true,
    protected: false,
    name: settings.name || DEFAULT_ROOT_NAME,
    coordinates: { x: 0, y: 0 },
    colors: {
      name: settings.colors.name || DEFAULT_ROOT_COLOR_NAME,
      background: settings.colors.background || DEFAULT_ROOT_COLOR_BACKGROUND,
      branch: settings.colors.branch ?? '',
    },
    font: {
      size: settings.font.size || DEFAULT_ROOT_FONT_SIZE,
      style: settings.font.style || DEFAULT_ROOT_FONT_STYLE,
      weight: settings.font.weight || DEFAULT_ROOT_FONT_WEIGHT,
    },
    image: { src: settings.image?.src ?? '', size: settings.image?.size ?? 0 },
    link: { href: '' },
  };
}

/**
 * Stores the Y.Doc of a new map: the root node and the map options, laid out
 * as the backend hydrates the doc of a map it has just created, and the
 * format number it is saved with.
 */
export function seedMapDoc(
  persistence: DocPersistence,
  mapId: string,
  root: MapNode,
  formatNumber: number
): Promise<void> {
  const doc = new Y.Doc();
  doc.transact(() => {
    const yRoot = new Y.Map<unknown>();
    populateYMapFromNodeProps(yRoot, root);
    nodesMapOf(doc).set(root.id, yRoot);
    doc.getMap('mapOptions').set('name', '');
    stampFormatNumber(doc, formatNumber);
  });
  const update = Y.encodeStateAsUpdate(doc);
  doc.destroy();
  return persistence.store(mapId, update);
}

/**
 * Runs the data migrations the stored doc of the map has not gone through,
 * and stores their changes together with the new format number as one
 * update. A migration that throws stores nothing. Rejects with
 * `NewerMapFormatError` for a map a later build saved. The caller keeps two
 * tabs from migrating the same map at once.
 */
export async function migrateMapDoc(
  persistence: DocPersistence,
  mapId: string,
  format: MapFormat
): Promise<void> {
  const update = await persistence.read(mapId);
  if (!update) return;
  const changes = withScratchDoc(update, doc =>
    runPendingMigrations(doc, format)
  );
  if (changes) await persistence.store(mapId, changes);
}

/** Loads the update into a doc that lives for the call of `use` alone. */
function withScratchDoc<T>(update: Uint8Array, use: (doc: Y.Doc) => T): T {
  const doc = new Y.Doc();
  try {
    Y.applyUpdate(doc, update);
    return use(doc);
  } finally {
    doc.destroy();
  }
}

/**
 * The update the pending migrations make to the doc, null when none is
 * pending.
 */
function runPendingMigrations(
  doc: Y.Doc,
  format: MapFormat
): Uint8Array | null {
  const formatNumber = mapFormatNumber(doc);
  if (formatNumber > format.formatNumber) {
    throw new NewerMapFormatError(
      `The map has the newer format ${formatNumber}`
    );
  }
  if (formatNumber === format.formatNumber) return null;
  const before = Y.encodeStateVector(doc);
  doc.transact(() => {
    const pending = pendingMigrations(format, formatNumber);
    pending.forEach(migration => migration.migrate(doc));
    stampFormatNumber(doc, format.formatNumber);
  });
  return Y.encodeStateAsUpdate(doc, before);
}

/** Reads the nodes, arrows and map options from the stored Y.Doc of a map. */
export async function readMapDoc(
  persistence: DocPersistence,
  mapId: string
): Promise<MapContent> {
  const update = await persistence.read(mapId);
  const doc = new Y.Doc();
  if (update) Y.applyUpdate(doc, update);
  try {
    return readMapContent(doc);
  } finally {
    doc.destroy();
  }
}

/** The name of the main root of the doc, null when it has none. */
export function mainRootName(doc: Y.Doc): string | null {
  const root = nodeEntries(nodesMapOf(doc)).find(([, yNode]) =>
    yNode.get('isRoot')
  );
  const name = root?.[1].get('name');
  return typeof name === 'string' ? name : null;
}

/** The nodes, arrows and map options the doc holds. */
function readMapContent(doc: Y.Doc): MapContent {
  return {
    data: nodeEntries(nodesMapOf(doc)).map(([id, yNode]) =>
      normalizeMapNode({ ...yMapToNodeProps(yNode), id })
    ),
    arrows: arrowEntries(arrowsMapOf(doc)).map(([, arrow]) => arrow),
    options: readMapOptions(doc),
  };
}

/** The map options the doc holds, without a value that is no number. */
function readMapOptions(doc: Y.Doc): MapOptions {
  const optionsMap = doc.getMap('mapOptions');
  const options: MapOptions = {};
  for (const key of MAP_OPTION_KEYS) {
    const value = optionsMap.get(key);
    if (typeof value === 'number') options[key] = value;
  }
  return options;
}
