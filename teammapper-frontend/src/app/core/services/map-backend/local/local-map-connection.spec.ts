import '../../../../../test/fake-indexeddb';
import localforage from 'localforage';
import * as Y from 'yjs';
import {
  chooseDocPersistence,
  DocPersistence,
  mapDatabaseName,
} from './doc-persistence';
import { CLOSE_STORAGE_OUTDATED } from '../map-connection';
import { FormatWatch, LocalMapConnection } from './local-map-connection';

const loadYIndexeddb = () => import('y-indexeddb');

// localforage falls back to localStorage where IndexedDB is missing.
const DRIVERS = [
  ['IndexedDB', localforage.INDEXEDDB],
  ['localStorage', localforage.LOCALSTORAGE],
] as const;

let persistence: Promise<DocPersistence>;

const connect = (mapId: string, doc = new Y.Doc(), release?: () => void) =>
  new LocalMapConnection(mapId, doc, () => persistence, release);

/** Opens a connection on a fresh doc and waits for its first sync. */
async function open(
  mapId: string,
  release?: () => void
): Promise<{ doc: Y.Doc; connection: LocalMapConnection }> {
  const doc = new Y.Doc();
  const connection = connect(mapId, doc, release);
  await new Promise<void>(resolve => connection.onSynced(resolve));
  return { doc, connection };
}

const names = (doc: Y.Doc) => doc.getMap('nodes').toJSON();

async function databaseNames(): Promise<(string | undefined)[]> {
  return (await indexedDB.databases()).map(database => database.name);
}

describe.each(DRIVERS)('LocalMapConnection with %s', (_name, driver) => {
  let mapId = 0;
  const nextMapId = () => `${driver}-map-${++mapId}`;
  let docs: LocalForage;

  beforeEach(() => {
    docs = localforage.createInstance({
      name: 'teammapper-offline',
      storeName: 'docs',
      driver,
    });
    persistence = chooseDocPersistence(loadYIndexeddb, docs, jest.fn());
  });

  it('keeps the doc in the storage of the chosen driver', async () => {
    const id = nextMapId();
    const { doc, connection } = await open(id);
    doc.getMap('nodes').set('a', 'first');
    await connection.destroy();

    const inIndexedDb = (await databaseNames()).includes(mapDatabaseName(id));
    expect(inIndexedDb).toBe(driver === localforage.INDEXEDDB);
    expect((await docs.keys()).includes(id)).toBe(
      driver === localforage.LOCALSTORAGE
    );
  });

  it('syncs once the stored doc has loaded', async () => {
    const id = nextMapId();
    const stored = new Y.Doc();
    stored.getMap('nodes').set('a', 'stored');
    await (await persistence).store(id, Y.encodeStateAsUpdate(stored));
    const doc = new Y.Doc();
    const connection = connect(id, doc);

    const namesAtSync = await new Promise(resolve =>
      connection.onSynced(() => resolve(names(doc)))
    );

    expect(namesAtSync).toEqual({ a: 'stored' });
    await connection.destroy();
  });

  it('reports connected at once', async () => {
    const connection = connect(nextMapId());
    const status = jest.fn();

    connection.onStatus(status);

    expect(status).toHaveBeenCalledWith('connected');
    await connection.destroy();
  });

  it('never reports a close, also not on destroy', async () => {
    const { connection } = await open(nextMapId());
    const closed = jest.fn();
    connection.onClosed(closed);

    await connection.destroy();

    expect(closed).not.toHaveBeenCalled();
  });

  it('keeps a local presence for the doc', async () => {
    const { doc, connection } = await open(nextMapId());

    connection.awareness.setLocalStateField('user', { color: '#000000' });

    expect(connection.awareness.clientID).toBe(doc.clientID);
    expect(connection.awareness.getStates().get(doc.clientID)).toEqual({
      user: { color: '#000000' },
    });
    await connection.destroy();
  });

  it('keeps the edits after destroy and loads them on the next open', async () => {
    const id = nextMapId();
    const first = await open(id);
    first.doc.getMap('nodes').set('a', 'first');
    await first.connection.destroy();

    const reopened = await open(id);

    expect(names(reopened.doc)).toEqual({ a: 'first' });
    await reopened.connection.destroy();
  });

  it('merges the edits of two docs on the same map', async () => {
    const id = nextMapId();
    const tabA = await open(id);
    const tabB = await open(id);

    tabA.doc.getMap('nodes').set('a', 'from A');
    tabB.doc.getMap('nodes').set('b', 'from B');
    await tabA.connection.destroy();
    await tabB.connection.destroy();
    const reloaded = await open(id);

    expect(names(reloaded.doc)).toEqual({ a: 'from A', b: 'from B' });
    await reloaded.connection.destroy();
  });

  it('keeps maps apart', async () => {
    const first = await open(nextMapId());
    first.doc.getMap('nodes').set('a', 'first');
    await first.connection.destroy();

    const other = await open(nextMapId());

    expect(names(other.doc)).toEqual({});
    await other.connection.destroy();
  });

  it('calls the release callback on destroy', async () => {
    const release = jest.fn();
    const { connection } = await open(nextMapId(), release);

    await connection.destroy();

    expect(release).toHaveBeenCalledTimes(1);
  });

  describe('once a later build changed the format of the stored maps', () => {
    /** A format watch the test reports the newer format through. */
    function formatWatch() {
      let notify: () => Promise<void> = () => Promise.resolve();
      const stop = jest.fn();
      const watch: FormatWatch = listener => {
        notify = listener;
        return stop;
      };
      return { watch, outdate: () => notify(), stop };
    }

    it('lets the later build wait for a close under way', async () => {
      const id = nextMapId();
      const format = formatWatch();
      const tab = await openWatched(id, format.watch);
      tab.doc.getMap('nodes').set('a', 'pending');

      void tab.connection.destroy();
      await format.outdate();

      const stored = new Y.Doc();
      const update = await (await persistence).read(id);
      if (update) Y.applyUpdate(stored, update);
      expect(names(stored)).toEqual({ a: 'pending' });
    });

    async function openWatched(id: string, watch: FormatWatch) {
      const doc = new Y.Doc();
      const connection = new LocalMapConnection(
        id,
        doc,
        () => persistence,
        undefined,
        watch
      );
      await new Promise<void>(resolve => connection.onSynced(resolve));
      return { doc, connection };
    }

    it('stores no further edit', async () => {
      const id = nextMapId();
      const stored = new Y.Doc();
      stored.getMap('nodes').set('a', 'stored');
      await (await persistence).store(id, Y.encodeStateAsUpdate(stored));
      const format = formatWatch();
      const tab = await openWatched(id, format.watch);

      format.outdate();
      tab.doc.getMap('nodes').set('b', 'after');
      await tab.connection.destroy();
      const reopened = await open(id);

      expect(names(reopened.doc)).toEqual({ a: 'stored' });
      await reopened.connection.destroy();
    });

    it('reports the outdated storage as its close', async () => {
      const format = formatWatch();
      const { connection } = await openWatched(nextMapId(), format.watch);
      const closed = jest.fn();
      connection.onClosed(closed);

      format.outdate();
      await Promise.resolve();

      expect(closed).toHaveBeenCalledWith(CLOSE_STORAGE_OUTDATED);
      await connection.destroy();
    });

    it('reports the close to a listener added after it', async () => {
      const connection = new LocalMapConnection(
        nextMapId(),
        new Y.Doc(),
        () => persistence,
        undefined,
        listener => {
          listener();
          return () => undefined;
        }
      );
      const closed = jest.fn();

      connection.onClosed(closed);

      expect(closed).toHaveBeenCalledWith(CLOSE_STORAGE_OUTDATED);
      await connection.destroy();
    });

    it('stops watching the format on destroy', async () => {
      const format = formatWatch();
      const { connection } = await openWatched(nextMapId(), format.watch);

      await connection.destroy();

      expect(format.stop).toHaveBeenCalledTimes(1);
    });
  });

  it('opens nothing when destroyed before the library loaded', async () => {
    const connection = connect(nextMapId());
    const synced = jest.fn();
    connection.onSynced(synced);

    await connection.destroy();

    expect(synced).not.toHaveBeenCalled();
  });
});

describe('LocalMapConnection when the page goes away', () => {
  let flush: jest.Mock<Promise<void>, []>;
  let fake: DocPersistence;

  /** Opens a connection on the fake persistence, synced. */
  async function openFake(): Promise<LocalMapConnection> {
    const connection = new LocalMapConnection('map', new Y.Doc(), () =>
      Promise.resolve(fake)
    );
    await new Promise<void>(resolve => connection.onSynced(resolve));
    return connection;
  }

  function setVisibility(state: DocumentVisibilityState): void {
    Object.defineProperty(document, 'visibilityState', {
      value: state,
      configurable: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));
  }

  beforeEach(() => {
    flush = jest.fn(() => Promise.resolve());
    fake = {
      attach: () =>
        Promise.resolve({
          close: () => Promise.resolve(),
          discard: () => Promise.resolve(),
          flush,
        }),
      store: jest.fn(),
      read: jest.fn(),
      delete: jest.fn(),
    };
  });

  // Drops the own property, so jsdom's getter applies again.
  afterEach(() => {
    Reflect.deleteProperty(document, 'visibilityState');
  });

  it('writes the pending state on pagehide', async () => {
    const connection = await openFake();

    window.dispatchEvent(new Event('pagehide'));
    await Promise.resolve();

    expect(flush).toHaveBeenCalledTimes(1);
    await connection.destroy();
  });

  it('writes the pending state when the page turns hidden', async () => {
    const connection = await openFake();

    setVisibility('hidden');
    await Promise.resolve();

    expect(flush).toHaveBeenCalledTimes(1);
    await connection.destroy();
  });

  it('writes nothing when the page turns visible', async () => {
    const connection = await openFake();

    setVisibility('visible');
    await Promise.resolve();

    expect(flush).not.toHaveBeenCalled();
    await connection.destroy();
  });

  it('writes nothing on pagehide once a later build changed the stored maps', async () => {
    let outdate: () => Promise<void> = () => Promise.resolve();
    const connection = new LocalMapConnection(
      'map',
      new Y.Doc(),
      () => Promise.resolve(fake),
      undefined,
      listener => {
        outdate = listener;
        return () => undefined;
      }
    );
    await new Promise<void>(resolve => connection.onSynced(resolve));
    await outdate();

    window.dispatchEvent(new Event('pagehide'));
    await Promise.resolve();

    expect(flush).not.toHaveBeenCalled();
    await connection.destroy();
  });

  it('writes nothing on pagehide after destroy', async () => {
    const connection = await openFake();
    await connection.destroy();

    window.dispatchEvent(new Event('pagehide'));
    await Promise.resolve();

    expect(flush).not.toHaveBeenCalled();
  });

  it('reports a failed write on pagehide', async () => {
    const error = new Error('quota exceeded');
    flush.mockRejectedValueOnce(error);
    const logged = jest.spyOn(console, 'error').mockImplementation();
    const connection = await openFake();

    window.dispatchEvent(new Event('pagehide'));
    await new Promise(resolve => setTimeout(resolve));

    expect(logged).toHaveBeenCalledWith('Failed to write the map:', error);
    logged.mockRestore();
    await connection.destroy();
  });
});
