import type {
  ExportNodeProperties,
  MapSnapshot,
  NodeProperty,
} from '@teammapper/shared';

/**
 * One node as the map data holds it. An implementation may return the object
 * it stores, so mmp never writes to a record and clones one before it keeps
 * a value or hands it to a caller.
 */
export type MapNodeRecord = Readonly<ExportNodeProperties>;

/**
 * The node ids one write or one batch added, updated or removed.
 */
export interface MapDataChange {
  /** The change added or rewrote the main root's entry: a load or an import. */
  replaced: boolean;
  /** Ids absent before the change and present after it. */
  added: string[];
  /** Ids present on both sides whose attributes changed. */
  updated: string[];
  /** Ids present before the change and absent after it, descendants included. */
  removed: string[];
}

/**
 * The nodes of one mind map. mmp reads every attribute through the map data,
 * writes through its typed methods and keeps no copy of its own. A write by
 * mmp, by a peer or by an undo reaches mmp the same way: as a change passed to
 * the listeners.
 *
 * Contract:
 * - A write notifies the listeners before it returns. Inside `batch`, the
 *   writes notify once, when the outermost batch ends.
 * - `updateNode` and `removeNode` on an id the data does not hold change
 *   nothing and notify nothing.
 * - `updateNode` takes the mmp property name, such as `backgroundColor`.
 *   Each implementation finds the storage path in `PropertyMapping`.
 * - A `replaceMap` reports the ids that survive it as `updated`, so the view
 *   state keeps the child nodes of those nodes hidden.
 */
export interface MapData {
  /** The node with `id`, or undefined when the data holds none. */
  node(id: string): MapNodeRecord | undefined;
  /** Every node, in the data's own order. */
  nodes(): MapNodeRecord[];
  /** The id of the node whose isRoot attribute is true, or null. */
  mainRootId(): string | null;

  /** Add the nodes, or overwrite the nodes whose ids the data holds. */
  addNodes(nodes: ExportNodeProperties[]): void;
  /** Write one property of one node. */
  updateNode(id: string, property: NodeProperty, value: unknown): void;
  /** Remove the node and its descendants. */
  removeNode(id: string): void;
  /** Replace every node: a load, an import or a new map. */
  replaceMap(nodes: MapSnapshot): void;
  /**
   * Run the writes `change` makes as one change: one notification, one
   * update to peers and one undo step. A nested batch joins the outer one.
   */
  batch(change: () => void): void;

  /**
   * Call the listener after every change. Returns the function that removes
   * the listener.
   */
  subscribe(listener: (change: MapDataChange) => void): () => void;
}
