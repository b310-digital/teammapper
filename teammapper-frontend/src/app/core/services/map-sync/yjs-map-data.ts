import * as Y from 'yjs';
import type { MapData, MapDataChange, MapNodeRecord } from '@teammapper/mmp';
import {
  arrowKey,
  ExportNodeProperties,
  MapArrow,
  MapSnapshot,
  NodeProperty,
  NodePropertyMapping,
} from '@teammapper/shared';
import {
  arrowAt,
  arrowEntries,
  ArrowsMap,
  arrowsMapOf,
  collectDescendantIds,
  nodeAt,
  nodeEntries,
  NodesMap,
  nodesMapOf,
  populateYMapFromNodeProps,
  toPlainValue,
  toStoredValue,
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

/** A change that reports nothing, for the observers to add to. */
const emptyChange = (): MapDataChange => ({
  replaced: false,
  added: [],
  updated: [],
  removed: [],
  arrows: [],
});

/** Whether the change lists no node and no arrow. */
const isEmpty = (change: MapDataChange): boolean =>
  change.added.length +
    change.updated.length +
    change.removed.length +
    change.arrows.length ===
  0;

/**
 * Whether the changed keys add or rewrite the main root's entry. Reads
 * `isRoot`, which marks the main root only: adding or pasting a tree writes
 * roots without it, so the check fires for an import or the undo of one.
 * Yjs reports a delete and re-set of one key as `update`, so the check reads
 * `add` and `update`.
 */
function replacesMainRoot(keys: KeyChanges, nodesMap: NodesMap): boolean {
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
 * Write the value at the path below the node's `key`. When `key` holds a
 * nested Y.Map, the write sets one key inside it. A peer with write access
 * can store any other value under `key`, such as a plain object, and the
 * write then replaces that value with a nested Y.Map holding the merged
 * attributes. Two clients that replace the same value at once both write
 * `key`, and Yjs keeps only one of their edits.
 */
function writeAt(
  yNode: Y.Map<unknown>,
  key: string,
  path: readonly string[],
  value: unknown
): void {
  const current = yNode.get(key);
  if (current instanceof Y.Map && path.length === 1) {
    current.set(path[0], clone(value));
    return;
  }
  const next = withValueAt(toPlainValue(current), path, value);
  yNode.set(key, toStoredValue(key, next));
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
   * Called with the transaction of a peer that replaces the main root, as an
   * import or its undo does, before the `subscribe` listeners run. A
   * transaction of ours never calls it.
   */
  public onPeerReplacement: ((transaction: Y.Transaction) => void) | null =
    null;

  /**
   * @param undoManager returns the undo manager, which the sync service
   * creates after the first sync, or null before that.
   */
  constructor(
    private readonly doc: Y.Doc,
    private readonly undoManager: () => Y.UndoManager | null
  ) {
    this.nodesMap.observeDeep(this.collectNodes);
    this.arrowsMap.observeDeep(this.collectArrows);
    this.doc.on('afterTransaction', this.flush);
  }

  private get nodesMap(): NodesMap {
    return nodesMapOf(this.doc);
  }

  private get arrowsMap(): ArrowsMap {
    return arrowsMapOf(this.doc);
  }

  public arrows(): MapArrow[] {
    return arrowEntries(this.arrowsMap).map(([, arrow]) => arrow);
  }

  /** Add the arrows the map lacks; an arrow under a held key stays as it is. */
  public addArrows(arrows: MapArrow[]): void {
    this.transact(() => arrows.forEach(arrow => this.writeArrow(arrow)));
  }

  public removeArrow(key: string): void {
    if (!arrowAt(this.arrowsMap, key)) return;
    this.transact(() => this.arrowsMap.delete(key));
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
   * Write the property, such as `backgroundColor`, under its own key in the
   * nested Y.Map of its attribute group (see the glossary).
   */
  public updateNode(id: string, property: NodeProperty, value: unknown): void {
    const yNode = nodeAt(this.nodesMap, id);
    if (!yNode) return;

    const [key, ...path]: readonly string[] = NodePropertyMapping[property];
    this.transact(() => writeAt(yNode, key, path, value));
  }

  public removeNode(id: string): void {
    if (!nodeAt(this.nodesMap, id)) return;

    const ids = new Set([id, ...collectDescendantIds(this.nodesMap, id)]);
    this.transact(() => {
      this.attachedArrowKeys(ids).forEach(key => this.arrowsMap.delete(key));
      ids.forEach(nodeId => this.nodesMap.delete(nodeId));
    });
  }

  /** The keys of the arrows whose source or target is one of the nodes. */
  private attachedArrowKeys(ids: ReadonlySet<string>): string[] {
    return arrowEntries(this.arrowsMap)
      .filter(([, { source, target }]) => ids.has(source) || ids.has(target))
      .map(([key]) => key);
  }

  /**
   * Replace every node and announce the import to peers in the same
   * transaction. Yjs transaction origins never reach a peer, so the
   * announcement is how a peer tells an import from an undo. The import gets
   * an undo step of its own, apart from the edits before and after it.
   */
  public replaceMap(nodes: MapSnapshot, arrows: MapArrow[] = []): void {
    this.inOwnUndoStep(() => {
      this.doc.getMap(META).set(LAST_MAP_ANNOUNCEMENT, 'import');
      Array.from(this.nodesMap.keys()).forEach(id => this.nodesMap.delete(id));
      Array.from(this.arrowsMap.keys()).forEach(key =>
        this.arrowsMap.delete(key)
      );
      nodes.forEach(node => this.writeNode(node));
      arrows.forEach(arrow => this.writeArrow(arrow));
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
    this.nodesMap.unobserveDeep(this.collectNodes);
    this.arrowsMap.unobserveDeep(this.collectArrows);
    this.doc.off('afterTransaction', this.flush);
    this.pending = emptyChange();
    this.listeners.clear();
    this.onPeerReplacement = null;
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

  private writeArrow({ source, target }: MapArrow): void {
    const key = arrowKey(source, target);
    if (arrowAt(this.arrowsMap, key)) return;
    const yArrow = new Y.Map<unknown>();
    yArrow.set('source', source);
    yArrow.set('target', target);
    this.arrowsMap.set(key, yArrow);
  }

  /**
   * The change of the running transaction. Both observers add to it, and
   * `flush` reports it once, so a transaction that touches both maps is one
   * change, whichever observer Yjs calls first.
   */
  private pending: MapDataChange = emptyChange();

  /**
   * Add the node events of a transaction to the pending change. A key change
   * on the nodes map adds, removes or rewrites a node; a change inside a
   * node's own map, such as its `colors`, updates the node under the first
   * key of the event's path.
   */
  private readonly collectNodes: Parameters<NodesMap['observeDeep']>[0] =
    events => {
      events.forEach(event => {
        if (event.target === this.nodesMap) {
          this.collectKeyChanges(event.changes.keys, this.pending);
        } else {
          this.collectNestedNodeChange(event.path);
        }
      });
    };

  /**
   * Add the arrow events of a transaction to the pending change. A field
   * written inside an arrow's own map reports the arrow's key, since a peer
   * can create an arrow before its fields and complete or break it later.
   */
  private readonly collectArrows: Parameters<ArrowsMap['observeDeep']>[0] =
    events => {
      events.forEach(event => {
        if (event.target === this.arrowsMap) {
          this.collectArrowChanges(event.changes.keys, this.pending);
        } else {
          this.collectNestedArrowChange(event.path);
        }
      });
    };

  private readonly flush = (transaction: Y.Transaction): void => {
    const change = this.withDistinctUpdates(this.pending);
    this.pending = emptyChange();

    if (change.replaced && !transaction.local) {
      this.onPeerReplacement?.(transaction);
    }
    if (isEmpty(change) && !change.replaced) return;
    this.listeners.forEach(listener => listener(change));
  };

  /**
   * Update the node under the first key of the path. A change inside an
   * entry that is no Y.Map, such as a peer's Y.Array, updates no node.
   */
  private collectNestedNodeChange(path: (string | number)[]): void {
    const [id] = path;
    if (typeof id === 'string' && nodeAt(this.nodesMap, id)) {
      this.pending.updated.push(id);
    }
  }

  /**
   * Report the arrow under the first key of the path. A change inside an
   * entry that is no Y.Map holds no arrow before or after, so it reports
   * nothing.
   */
  private collectNestedArrowChange(path: (string | number)[]): void {
    const [key] = path;
    if (typeof key === 'string' && this.arrowsMap.get(key) instanceof Y.Map) {
      this.pending.arrows.push(key);
    }
  }

  /**
   * List the key of every entry that held an arrow before the change or holds
   * one after it.
   */
  private collectArrowChanges(keys: KeyChanges, change: MapDataChange): void {
    keys.forEach(({ action, oldValue }, key) => {
      const before = action !== 'add' && oldValue instanceof Y.Map;
      const after = action !== 'delete' && !!arrowAt(this.arrowsMap, key);
      if (before || after) change.arrows.push(key);
    });
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

  /**
   * List each updated id once, and none that the change added or removed, and
   * each arrow key once, sorted.
   */
  private withDistinctUpdates(change: MapDataChange): MapDataChange {
    const elsewhere = new Set([...change.added, ...change.removed]);
    const updated = new Set(change.updated.filter(id => !elsewhere.has(id)));
    const arrows = [...new Set(change.arrows)].sort();
    return { ...change, updated: [...updated], arrows };
  }
}
