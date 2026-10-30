import { InjectionToken } from '@angular/core';
import localforage from 'localforage';
import * as Y from 'yjs';
import type * as YIndexeddbModule from 'y-indexeddb';

/** The IndexedDB database in which y-indexeddb keeps the Y.Doc of a map. */
export const mapDatabaseName = (mapId: string): string =>
  `teammapper-map-${mapId}`;

export type YIndexeddb = typeof YIndexeddbModule;

/**
 * Loads y-indexeddb on first use. main.ts writes the dynamic import in the
 * branch only the offline build keeps, so the web build emits no chunk for
 * the library.
 */
export type YIndexeddbLoader = () => Promise<YIndexeddb>;

export const Y_INDEXEDDB_LOADER = new InjectionToken<YIndexeddbLoader>(
  'Y_INDEXEDDB_LOADER'
);

/** A doc whose persistence keeps storing its updates until `close`. */
export interface StoredDoc {
  /** Stops storing the doc's updates and writes what is pending. */
  close(): Promise<void>;
  /**
   * Starts any write the doc still holds back and resolves once every write
   * started so far completed. The doc keeps storing its updates.
   */
  flush(): Promise<void>;
  /**
   * Stops storing the doc's updates and drops what is pending. Resolves once
   * the writes already under way are done.
   */
  discard(): Promise<void>;
}

/**
 * Keeps the Y.Doc of every map in the browser. The store and the connection
 * reach the stored docs through this interface alone, so seeding, reading,
 * opening and deleting a map's content all use the same storage.
 */
export interface DocPersistence {
  /**
   * Loads the stored doc of the map into `doc`, stores the state `doc`
   * already holds, and keeps storing its updates until the returned doc
   * closes.
   */
  attach(mapId: string, doc: Y.Doc): Promise<StoredDoc>;
  /** Adds an update to the stored doc of the map. */
  store(mapId: string, update: Uint8Array): Promise<void>;
  /** The stored doc of the map as one update, null when it has none. */
  read(mapId: string): Promise<Uint8Array | null>;
  /** Deletes the stored doc of the map. */
  delete(mapId: string): Promise<void>;
}

/** How long an attached doc stays unchanged before its state is written. */
export const DOC_WRITE_DEBOUNCE_MS = 1000;

/**
 * Picks the persistence for the driver localforage chose for `docs`:
 * y-indexeddb on IndexedDB, and one merged update per map in `docs` on any
 * other driver, where y-indexeddb would never finish loading.
 *
 * @param onWriteError reports a failed write of an attached doc, which runs
 * after the caller returned
 */
export async function chooseDocPersistence(
  loadYIndexeddb: YIndexeddbLoader,
  docs: LocalForage,
  onWriteError: (error: unknown) => void
): Promise<DocPersistence> {
  await docs.ready();
  return docs.driver() === localforage.INDEXEDDB
    ? indexeddbPersistence(await loadYIndexeddb())
    : new MergedUpdatePersistence(docs, onWriteError);
}

/**
 * Keeps each doc as one merged update under the map id in `docs`. Every write
 * merges the stored update with the doc's state, so the edits another tab
 * stored in between stay.
 */
class MergedUpdatePersistence implements DocPersistence {
  constructor(
    private readonly docs: LocalForage,
    private readonly onWriteError: (error: unknown) => void
  ) {}

  async attach(mapId: string, doc: Y.Doc): Promise<StoredDoc> {
    const hasState = doc.store.clients.size > 0;
    const stored = await this.read(mapId);
    if (stored) Y.applyUpdate(doc, stored, this);
    const write = (update: Uint8Array) =>
      this.store(mapId, update).catch(this.onWriteError);
    return new MergedUpdateDoc(doc, write, hasState);
  }

  async store(mapId: string, update: Uint8Array): Promise<void> {
    const stored = await this.read(mapId);
    const merged = stored ? Y.mergeUpdates([stored, update]) : update;
    await this.docs.setItem(mapId, merged);
  }

  read(mapId: string): Promise<Uint8Array | null> {
    return this.docs.getItem<Uint8Array>(mapId);
  }

  delete(mapId: string): Promise<void> {
    return this.docs.removeItem(mapId);
  }
}

/**
 * Writes the doc's state once it has had no update for
 * `DOC_WRITE_DEBOUNCE_MS`, one write after the other.
 */
class MergedUpdateDoc implements StoredDoc {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private writing: Promise<void> = Promise.resolve();

  /** @param pending writes the state the doc held before it attached */
  constructor(
    private readonly doc: Y.Doc,
    private readonly write: (update: Uint8Array) => Promise<void>,
    pending: boolean
  ) {
    doc.on('update', this.schedule);
    if (pending) this.schedule();
  }

  close(): Promise<void> {
    this.doc.off('update', this.schedule);
    return this.flush();
  }

  flush(): Promise<void> {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.writeState();
    }
    return this.writing;
  }

  discard(): Promise<void> {
    this.doc.off('update', this.schedule);
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    return this.writing;
  }

  private readonly schedule = (): void => {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.writeState(), DOC_WRITE_DEBOUNCE_MS);
  };

  private writeState(): void {
    this.timer = null;
    const update = Y.encodeStateAsUpdate(this.doc);
    this.writing = this.writing.then(() => this.write(update));
  }
}

/**
 * Keeps each doc in a database of its own. y-indexeddb attaches the open doc
 * and adds every update at once, without waiting for the write, so a flush
 * only waits for those writes to complete. Seeding and reading go to the database directly:
 * y-indexeddb adds an update on every load and reports no failed write.
 */
function indexeddbPersistence(yIndexeddb: YIndexeddb): DocPersistence {
  return {
    attach: async (mapId, doc) => {
      const persistence = new yIndexeddb.IndexeddbPersistence(
        mapDatabaseName(mapId),
        doc
      );
      await persistence.whenSynced;
      return {
        close: () => persistence.destroy(),
        flush: () => awaitWrites(persistence.db),
        discard: async () => {
          // The transaction starts before the destroy closes the database, so
          // it completes after every write y-indexeddb started.
          const written = awaitWrites(persistence.db);
          await persistence.destroy();
          await written;
        },
      };
    },
    store: (mapId, update) => addUpdate(mapDatabaseName(mapId), update),
    read: async mapId => {
      const updates = await readUpdates(mapDatabaseName(mapId));
      return updates.length > 0 ? Y.mergeUpdates(updates) : null;
    },
    delete: mapId => yIndexeddb.clearDocument(mapDatabaseName(mapId)),
  };
}

// The object store in which y-indexeddb keeps the updates of a doc.
const UPDATES_STORE = 'updates';

/**
 * Opens the database of a map. A missing database gets the layout
 * y-indexeddb creates, unless `create` is false: then it stays missing and
 * the promise resolves null.
 */
function openMapDatabase(
  name: string,
  create: boolean
): Promise<IDBDatabase | null> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name);
    request.onupgradeneeded = () => {
      if (!create) return request.transaction?.abort();
      request.result.createObjectStore(UPDATES_STORE, { autoIncrement: true });
      request.result.createObjectStore('custom');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      request.error?.name === 'AbortError' && !create
        ? resolve(null)
        : reject(request.error);
  });
}

/** Adds an update to the database of a map, as y-indexeddb would. */
async function addUpdate(name: string, update: Uint8Array): Promise<void> {
  const database = await openMapDatabase(name, true);
  if (!database) throw new Error(`Failed to open the database ${name}`);
  try {
    const transaction = database.transaction(UPDATES_STORE, 'readwrite');
    transaction.objectStore(UPDATES_STORE).add(update);
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = transaction.onabort = () =>
        reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

/**
 * Resolves once every write started on `database` so far completed.
 * IndexedDB runs read-write transactions on the same store in the order they
 * were created, so an empty one completes after all earlier ones.
 */
async function awaitWrites(database: IDBDatabase | null): Promise<void> {
  if (!database) return;
  const transaction = database.transaction(UPDATES_STORE, 'readwrite');
  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = transaction.onabort = () => reject(transaction.error);
  });
}

/** The updates in the database of a map, none when it has no database. */
async function readUpdates(name: string): Promise<Uint8Array[]> {
  const database = await openMapDatabase(name, false);
  if (!database) return [];
  try {
    const request = database
      .transaction(UPDATES_STORE, 'readonly')
      .objectStore(UPDATES_STORE)
      .getAll();
    return await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    database.close();
  }
}
