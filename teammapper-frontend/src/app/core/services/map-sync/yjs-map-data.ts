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

type NodesMap = Y.Map<Y.Map<unknown>>;
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
    if (nodesMap.get(key)?.get('isRoot')) return true;
  }
  return false;
}

/**
 * The record of the node stored under `id`. The id comes from the key, since
 * a peer may write a node whose own `id` field names a different node.
 */
function recordOf(id: string, yNode: Y.Map<unknown>): MapNodeRecord {
  return { ...yMapToNodeProps(yNode), id };
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
    return this.doc.getMap('nodes') as NodesMap;
  }

  public node(id: string): MapNodeRecord | undefined {
    const yNode = this.nodesMap.get(id);
    return yNode ? recordOf(id, yNode) : undefined;
  }

  public nodes(): MapNodeRecord[] {
    return Array.from(this.nodesMap.entries(), ([id, yNode]) =>
      recordOf(id, yNode)
    );
  }

  public mainRootId(): string | null {
    for (const [id, yNode] of this.nodesMap) {
      if (yNode.get('isRoot')) return id;
    }
    return null;
  }

  public addNodes(nodes: ExportNodeProperties[]): void {
    this.transact(() => nodes.forEach(node => this.writeNode(node)));
  }

  /**
   * Write the whole top-level key the property belongs to, such as `colors`
   * for `backgroundColor`, so a peer receives the object in one piece.
   */
  public updateNode(id: string, property: NodeProperty, value: unknown): void {
    const yNode = this.nodesMap.get(id);
    if (!yNode) return;

    const [key, ...path]: readonly string[] = NodePropertyMapping[property];
    this.transact(() =>
      yNode.set(key, withValueAt(yNode.get(key), path, value))
    );
  }

  public removeNode(id: string): void {
    if (!this.nodesMap.has(id)) return;

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
    this.undoManager()?.stopCapturing();
    this.transact(() => {
      this.doc.getMap(META).set(LAST_MAP_ANNOUNCEMENT, 'import');
      Array.from(this.nodesMap.keys()).forEach(id => this.nodesMap.delete(id));
      nodes.forEach(node => this.writeNode(node));
    });
    this.undoManager()?.stopCapturing();
  }

  /**
   * Run the writes in one transaction, so peers receive one update. Without
   * the stops, Yjs merges the batch with whatever the user did in the half
   * second around it, and one undo reverts both. A nested batch joins the
   * transaction of the outer one.
   */
  public batch(change: () => void): void {
    this.undoManager()?.stopCapturing();
    this.transact(change);
    this.undoManager()?.stopCapturing();
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
   * map, such as its `colors`, updates that node.
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
      } else {
        change.updated.push(String(event.path[0]));
      }
    }
    return this.withDistinctUpdates(change);
  }

  private collectKeyChanges(keys: KeyChanges, change: MapDataChange): void {
    keys.forEach(({ action }, id) => {
      if (action === 'add') change.added.push(id);
      else if (action === 'delete') change.removed.push(id);
      else change.updated.push(id);
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
