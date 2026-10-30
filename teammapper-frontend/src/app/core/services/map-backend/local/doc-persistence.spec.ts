import '../../../../../test/fake-indexeddb';
import localforage from 'localforage';
import * as Y from 'yjs';
import {
  chooseDocPersistence,
  DocPersistence,
  mapDatabaseName,
} from './doc-persistence';

const loadYIndexeddb = () => import('y-indexeddb');

// localforage falls back to localStorage where IndexedDB is missing.
const DRIVERS = [
  ['IndexedDB', localforage.INDEXEDDB],
  ['localStorage', localforage.LOCALSTORAGE],
] as const;

/** An update that sets one node name in a fresh doc. */
function updateWith(key: string, name: string): Uint8Array {
  const doc = new Y.Doc();
  doc.getMap('nodes').set(key, name);
  return Y.encodeStateAsUpdate(doc);
}

/** The node names an update holds. */
function namesIn(update: Uint8Array | null): Record<string, unknown> {
  const doc = new Y.Doc();
  if (update) Y.applyUpdate(doc, update);
  return doc.getMap('nodes').toJSON();
}

async function databaseNames(): Promise<(string | undefined)[]> {
  return (await indexedDB.databases()).map(database => database.name);
}

describe.each(DRIVERS)('DocPersistence with %s', (_name, driver) => {
  let mapId = 0;
  const nextMapId = () => `${driver}-persisted-${++mapId}`;
  let persistence: DocPersistence;

  beforeEach(async () => {
    const docs = localforage.createInstance({
      name: 'teammapper-offline',
      storeName: 'docs',
      driver,
    });
    persistence = await chooseDocPersistence(loadYIndexeddb, docs, jest.fn());
  });

  it('reads back what it stored', async () => {
    const id = nextMapId();

    await persistence.store(id, updateWith('a', 'first'));

    expect(namesIn(await persistence.read(id))).toEqual({ a: 'first' });
  });

  it('keeps every stored update', async () => {
    const id = nextMapId();

    await persistence.store(id, updateWith('a', 'first'));
    await persistence.store(id, updateWith('b', 'second'));

    expect(namesIn(await persistence.read(id))).toEqual({
      a: 'first',
      b: 'second',
    });
  });

  it('reads nothing for a map it never stored, and creates nothing', async () => {
    const id = nextMapId();

    expect(await persistence.read(id)).toBeNull();
    expect(await databaseNames()).not.toContain(mapDatabaseName(id));
  });

  it('reads nothing after a delete', async () => {
    const id = nextMapId();
    await persistence.store(id, updateWith('a', 'first'));

    await persistence.delete(id);

    expect(await persistence.read(id)).toBeNull();
  });

  it('loads a stored update into a doc it attaches', async () => {
    const id = nextMapId();
    await persistence.store(id, updateWith('a', 'first'));
    const doc = new Y.Doc();

    const stored = await persistence.attach(id, doc);
    await stored.close();

    expect(doc.getMap('nodes').toJSON()).toEqual({ a: 'first' });
  });

  it('stores an edit on flush, before the write debounce elapses', async () => {
    const id = nextMapId();
    const doc = new Y.Doc();
    const stored = await persistence.attach(id, doc);
    doc.getMap('nodes').set('a', 'first');

    await stored.flush();

    expect(namesIn(await persistence.read(id))).toEqual({ a: 'first' });
    await stored.close();
  });

  it('keeps storing edits after a flush', async () => {
    const id = nextMapId();
    const doc = new Y.Doc();
    const stored = await persistence.attach(id, doc);
    await stored.flush();

    doc.getMap('nodes').set('b', 'second');
    await stored.close();

    expect(namesIn(await persistence.read(id))).toEqual({ b: 'second' });
  });

  it('resolves a flush with nothing pending', async () => {
    const stored = await persistence.attach(nextMapId(), new Y.Doc());

    await expect(stored.flush()).resolves.toBeUndefined();
    await stored.close();
  });

  it('stores no edit made after a discard', async () => {
    const id = nextMapId();
    await persistence.store(id, updateWith('a', 'first'));
    const doc = new Y.Doc();
    const stored = await persistence.attach(id, doc);

    await stored.discard();
    doc.getMap('nodes').set('b', 'after');

    expect(namesIn(await persistence.read(id))).toEqual({ a: 'first' });
  });
});

describe('DocPersistence with localStorage, on discard', () => {
  it('drops the edit still waiting to be written', async () => {
    const docs = localforage.createInstance({
      name: 'teammapper-offline',
      storeName: 'docs',
      driver: localforage.LOCALSTORAGE,
    });
    const persistence = await chooseDocPersistence(
      loadYIndexeddb,
      docs,
      jest.fn()
    );
    await persistence.store('pending', updateWith('a', 'first'));
    const doc = new Y.Doc();
    const stored = await persistence.attach('pending', doc);

    doc.getMap('nodes').set('b', 'pending');
    await stored.discard();

    expect(namesIn(await persistence.read('pending'))).toEqual({
      a: 'first',
    });
  });
});
