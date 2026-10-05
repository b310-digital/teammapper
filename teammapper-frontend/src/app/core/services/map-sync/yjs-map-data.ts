import * as Y from 'yjs';
import { NodePropertyMapping } from '@teammapper/mmp';
import type { MapData, MapDataChange, MapNodeRecord } from '@teammapper/mmp';
import {
  ExportNodeProperties,
  MapSnapshot,
  NodeProperty,
} from '@teammapper/shared';
import {
  collectDescendantIds,
  nodeAt,
  nodeEntries,
  NodesMap,
  nodesMapOf,
  populateYMapFromNodeProps,
  yMapToNodeProps,
} from './yjs-utils';

/**
 * The origin every write of ours carries, and the only one the undo manager
 * tracks. A peer's change arrives with the WebsocketProvider as its origin,
 * so it is never ours to undo.
 */
export const LOCAL_ORIGIN = 'local';

/** Doc-level metadata, shared with peers alongside the nodes themselves. */
export const META = 'meta';

/**
 * The most recent full-map announcement broadcast to peers. A reader trusts
 * the value only inside the transaction that wrote it; after that
 * transaction the value describes a past operation.
 */
export const LAST_MAP_ANNOUNCEMENT = 'lastMapAnnouncement';

type Listener = (change: MapDataChange) => void;
type KeyChanges = Y.YEvent<Y.AbstractType<unknown>>['changes']['keys'];

/** A deep copy of a JSON value, so no caller shares an object with the doc. */
const clone = <T>(value: T): T =>
  typeof value === 'object' && value !== null
    ? (JSON.parse(JSON.stringify(value)) as T)
    : value;

/**
 * Whether the changed keys add or rewrite the main root's entry. Reads
 * `isRoot`, which marks the main root only: adding or pasting a tree writes
 * roots without it, so the check fires for an import or the undo of one.
 * Yjs reports a delete and re-set of one key as `update`, so the check reads
 * `add` and `update`.
 */
export function replacesMainRoot(
  keys: KeyChanges,
  nodesMap: NodesMap
): boolean {
  for (const [key, change] of keys) {
    if (change.action === 'delete') continue;
    if (nodeAt(nodesMap, key)?.get('isRoot')) return true;
  }
  return false;
}

/**
 * The record of the node stored under `id`. The id comes from the key, since
 * a peer may write a node whose own `id` field names a different node. The
 * other values stay unchecked: mmp passes every record through `resolveNode`,
 * which validates each value against the shared schemas before use.
 */
function recordOf(id: string, yNode: Y.Map<unknown>): MapNodeRecord {
  const stored = yMapToNodeProps(yNode) as Omit<MapNodeRecord, 'id'>;
  return { ...stored, id };
}

/** Copy the value into `current` at the path, leaving `current` untouched. */
function withValueAt(
  current: unknown,
  path: readonly string[],
  value: unknown
): unknown {
  if (path.length === 0) return clone(value);
  const [key, ...rest] = path;
  const owner =
    typeof current === 'object' && current !== null
      ? (current as Record<string, unknown>)
      : {};
  return { ...owner, [key]: withValueAt(owner[key], rest, value) };
}

/**
 * The map data of a collaborative map: the nodes in the Y.Doc's `nodes` map.
 * Every write carries `LOCAL_ORIGIN`, so the undo manager records it. The
 * observer reports every transaction, local, remote and undo alike, as one
 * change, which is how mmp learns of a peer's edit.
 */
export class YjsMapData implements MapData {
  private readonly listeners = new Set<Listener>();

  /**
   * @param undoManager returns the undo manager, which the sync service
   * creates after the first sync, or null before that.
   */
  constructor(
    private readonly doc: Y.Doc,
    private readonly undoManager: () => Y.UndoManager | null
  ) {
    this.nodesMap.observeDeep(this.notify);
  }

  private get nodesMap(): NodesMap {
    return nodesMapOf(this.doc);
  }

  public node(id: string): MapNodeRecord | undefined {
    const yNode = nodeAt(this.nodesMap, id);
    return yNode ? recordOf(id, yNode) : undefined;
  }

  public nodes(): MapNodeRecord[] {
    return nodeEntries(this.nodesMap).map(([id, yNode]) => recordOf(id, yNode));
  }

  public mainRootId(): string | null {
    const root = nodeEntries(this.nodesMap).find(([, yNode]) =>
      yNode.get('isRoot')
    );
    return root ? root[0] : null;
  }

  public addNodes(nodes: ExportNodeProperties[]): void {
    this.transact(() => nodes.forEach(node => this.writeNode(node)));
  }

  /**
   * Write the whole top-level key the property belongs to, such as `colors`
   * for `backgroundColor`, so a peer receives the object in one piece.
   */
  public updateNode(id: string, property: NodeProperty, value: unknown): void {
    const yNode = nodeAt(this.nodesMap, id);
    if (!yNode) return;

    const [key, ...path]: readonly string[] = NodePropertyMapping[property];
    this.transact(() =>
      yNode.set(key, withValueAt(yNode.get(key), path, value))
    );
  }

  public removeNode(id: string): void {
    if (!nodeAt(this.nodesMap, id)) return;

    const ids = [id, ...collectDescendantIds(this.nodesMap, id)];
    this.transact(() => ids.forEach(nodeId => this.nodesMap.delete(nodeId)));
  }

  /**
   * Replace every node and announce the import to peers in the same
   * transaction. Yjs transaction origins never reach a peer, so the
   * announcement is how a peer tells an import from an undo. The import gets
   * an undo step of its own, apart from the edits before and after it.
   */
  public replaceMap(nodes: MapSnapshot): void {
    this.inOwnUndoStep(() => {
      this.doc.getMap(META).set(LAST_MAP_ANNOUNCEMENT, 'import');
      Array.from(this.nodesMap.keys()).forEach(id => this.nodesMap.delete(id));
      nodes.forEach(node => this.writeNode(node));
    });
  }

  /**
   * Run the writes in one transaction, so peers receive one update. Without
   * the stops, Yjs merges the batch with whatever the user did in the half
   * second around it, and one undo reverts both. A nested batch joins the
   * transaction of the outer one.
   */
  public batch(change: () => void): void {
    this.inOwnUndoStep(change);
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Stop observing the doc and drop every listener. */
  public destroy(): void {
    this.nodesMap.unobserveDeep(this.notify);
    this.listeners.clear();
  }

  private transact(change: () => void): void {
    this.doc.transact(change, LOCAL_ORIGIN);
  }

  /**
   * Run the writes in one transaction that takes an undo step of its own.
   * The closing stop runs even when `change` throws, so the next edit never
   * joins the step of a failed batch.
   */
  private inOwnUndoStep(change: () => void): void {
    this.undoManager()?.stopCapturing();
    try {
      this.transact(change);
    } finally {
      this.undoManager()?.stopCapturing();
    }
  }

  private writeNode(node: ExportNodeProperties): void {
    const yNode = new Y.Map<unknown>();
    populateYMapFromNodeProps(yNode, clone(node));
    this.nodesMap.set(node.id, yNode);
  }

  private readonly notify: Parameters<NodesMap['observeDeep']>[0] = events => {
    const change = this.changeOf(events);
    const empty =
      change.added.length + change.updated.length + change.removed.length === 0;
    if (empty && !change.replaced) return;
    this.listeners.forEach(listener => listener(change));
  };

  /**
   * Sum the events of one transaction up by node id. A key change on the
   * nodes map adds, removes or rewrites a node; a change inside a node's own
   * map, such as its `colors`, updates that node. A change inside an entry
   * that is no Y.Map, such as a peer's Y.Array, updates no node.
   */
  private changeOf(events: Y.YEvent<Y.AbstractType<unknown>>[]) {
    const change: MapDataChange = {
      replaced: false,
      added: [],
      updated: [],
      removed: [],
    };
    for (const event of events) {
      if ((event.target as unknown) === this.nodesMap) {
        this.collectKeyChanges(event.changes.keys, change);
        continue;
      }
      const id = String(event.path[0]);
      if (nodeAt(this.nodesMap, id)) change.updated.push(id);
    }
    return this.withDistinctUpdates(change);
  }

  /**
   * Sort each key by whether it held a node before and after the change. A
   * value that is no Y.Map holds no node, so a peer that overwrites a node
   * with another value removes it, and one that writes such a value under a
   * new key changes nothing.
   */
  private collectKeyChanges(keys: KeyChanges, change: MapDataChange): void {
    keys.forEach(({ action, oldValue }, id) => {
      const before = action !== 'add' && oldValue instanceof Y.Map;
      const after = action !== 'delete' && !!nodeAt(this.nodesMap, id);
      if (before && after) change.updated.push(id);
      else if (after) change.added.push(id);
      else if (before) change.removed.push(id);
    });
    change.replaced ||= replacesMainRoot(keys, this.nodesMap);
  }

  /** List each updated id once, and none that the change added or removed. */
  private withDistinctUpdates(change: MapDataChange): MapDataChange {
    const elsewhere = new Set([...change.added, ...change.removed]);
    const updated = new Set(change.updated.filter(id => !elsewhere.has(id)));
    return { ...change, updated: [...updated] };
  }
}
