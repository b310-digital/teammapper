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
});
