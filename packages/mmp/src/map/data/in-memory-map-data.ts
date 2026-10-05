import { collectSubtreeIds } from '@teammapper/shared';
import type {
  ExportNodeProperties,
  MapSnapshot,
  NodeProperty,
} from '@teammapper/shared';
import Utils from '../../utils/utils.js';
import type { MapData, MapDataChange, MapNodeRecord } from './map-data.js';
import { PropertyMapping } from './property-mapping.js';

type Listener = (change: MapDataChange) => void;

/**
 * What the running write or batch did so far. `existed` records, for each id
 * a write added, rewrote or deleted, whether the data held it when the change
 * began.
 */
interface PendingChange {
  existed: Map<string, boolean>;
  updated: Set<string>;
  replaced: boolean;
}

/**
 * Map data that holds the records in memory, by id, in insertion order. The
 * mmp specs run against it. Each record goes in as a copy, so no caller
 * shares an object with it; a read returns the stored record.
 */
export default class InMemoryMapData implements MapData {
  private readonly entries = new Map<string, ExportNodeProperties>();
  private readonly listeners = new Set<Listener>();
  private pending: PendingChange | null = null;
  private depth = 0;

  constructor(nodes: MapSnapshot = []) {
    nodes.forEach(node => this.entries.set(node.id, Utils.cloneObject(node)));
  }

  public node(id: string): MapNodeRecord | undefined {
    return this.entries.get(id);
  }

  public nodes(): MapNodeRecord[] {
    return Array.from(this.entries.values());
  }

  public mainRootId(): string | null {
    for (const entry of this.entries.values()) {
      if (entry.isRoot) return entry.id;
    }
    return null;
  }

  public addNodes(nodes: ExportNodeProperties[]): void {
    this.batch(() => {
      for (const node of nodes) {
        // The flush reports the id as updated only when it existed before
        // the change, so a remove and re-add in one batch counts as an update.
        const change = this.touch(node.id);
        change.updated.add(node.id);
        if (node.isRoot) change.replaced = true;
        this.entries.set(node.id, Utils.cloneObject(node));
      }
    });
  }

  public updateNode(id: string, property: NodeProperty, value: unknown): void {
    const entry = this.entries.get(id);
    if (!entry) return;

    // A record read earlier keeps its values, as the contract lets a reader
    // hold one for the length of a call.
    const next = Utils.cloneObject(entry);
    writePath(next, PropertyMapping[property], value);
    this.batch(() => {
      this.touch(id).updated.add(id);
      this.entries.set(id, next);
    });
  }

  public removeNode(id: string): void {
    if (!this.entries.has(id)) return;

    this.batch(() => {
      const ids = [id, ...collectSubtreeIds(this.nodes(), id)];
      for (const removed of ids) {
        this.touch(removed);
        this.entries.delete(removed);
      }
    });
  }

  public replaceMap(nodes: MapSnapshot): void {
    this.batch(() => {
      for (const id of this.entries.keys()) this.touch(id);
      this.entries.clear();
      this.addNodes(nodes);
    });
  }

  public batch(change: () => void): void {
    this.depth++;
    try {
      change();
    } finally {
      this.depth--;
      if (this.depth === 0) this.flush();
    }
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Record `id` in the running change, and return the change. */
  private touch(id: string): PendingChange {
    this.pending ??= {
      existed: new Map(),
      updated: new Set(),
      replaced: false,
    };
    if (!this.pending.existed.has(id)) {
      this.pending.existed.set(id, this.entries.has(id));
    }
    return this.pending;
  }

  /** Notify the listeners of the finished change, if it changed anything. */
  private flush() {
    const pending = this.pending;
    this.pending = null;
    if (!pending) return;

    const change: MapDataChange = {
      replaced: pending.replaced,
      added: [],
      updated: [],
      removed: [],
    };
    for (const [id, existed] of pending.existed) {
      const exists = this.entries.has(id);
      if (!existed && exists) change.added.push(id);
      if (existed && !exists) change.removed.push(id);
      if (existed && exists && pending.updated.has(id)) {
        change.updated.push(id);
      }
    }

    const empty =
      change.added.length + change.updated.length + change.removed.length === 0;
    if (empty && !change.replaced) return;

    this.listeners.forEach(listener => listener(change));
  }
}

/** Write the value at the path, creating each missing object on the way. */
function writePath(
  entry: ExportNodeProperties,
  path: readonly string[],
  value: unknown
) {
  const key = path[path.length - 1];
  const owner = path.slice(0, -1).reduce<Record<string, unknown>>(
    (target, segment) => {
      const next = target[segment];
      if (typeof next === 'object' && next !== null) {
        return next as Record<string, unknown>;
      }
      const created: Record<string, unknown> = {};
      target[segment] = created;
      return created;
    },
    entry as unknown as Record<string, unknown>
  );

  owner[key] =
    typeof value === 'object' && value !== null
      ? Utils.cloneObject(value)
      : value;
}
