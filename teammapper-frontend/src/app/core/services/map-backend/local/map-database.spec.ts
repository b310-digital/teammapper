import '../../../../../test/fake-indexeddb';
import localforage from 'localforage';
import * as Y from 'yjs';
import { chooseDocPersistence, DocPersistence } from './doc-persistence';
import { newRootNode, seedMapDoc, migrateMapDoc } from './map-database';
import {
  DataMigration,
  MapFormat,
  mapFormatNumber,
  NewerMapFormatError,
  stampFormatNumber,
} from './map-format';

const ROOT_SETTINGS = {
  name: 'Root',
  link: { href: '' },
  image: { src: '', size: 0 },
  colors: { name: '', background: '', branch: '' },
  font: { size: 0, style: '', weight: '' },
};

/** A migration that records its run in the doc's map options. */
const recordingMigration = (formatNumber: number): DataMigration => ({
  formatNumber,
  migrate: doc => {
    const options = doc.getMap('mapOptions');
    const runs = options.get('runs');
    const previous = Array.isArray(runs) ? runs : [];
    options.set('runs', [...previous, formatNumber]);
  },
});

const failingMigration = (formatNumber: number): DataMigration => ({
  formatNumber,
  migrate: doc => {
    doc.getMap('mapOptions').set('half', true);
    throw new Error('Migration failed');
  },
});

describe('map database', () => {
  let mapId = 0;
  const nextMapId = () => `format-map-${++mapId}`;
  let persistence: DocPersistence;

  beforeEach(async () => {
    const docs = localforage.createInstance({
      name: 'teammapper-offline',
      storeName: 'docs',
    });
    persistence = await chooseDocPersistence(
      () => import('y-indexeddb'),
      docs,
      jest.fn()
    );
  });

  /** The stored doc of the map, loaded into a fresh doc. */
  async function stored(id: string): Promise<Y.Doc> {
    const doc = new Y.Doc();
    const update = await persistence.read(id);
    if (update) Y.applyUpdate(doc, update);
    return doc;
  }

  /** Stores a map whose doc carries the format number. */
  async function storeMapOf(formatNumber: number): Promise<string> {
    const id = nextMapId();
    await seedMapDoc(persistence, id, newRootNode(ROOT_SETTINGS), 1);
    if (formatNumber !== 1) {
      const doc = await stored(id);
      const before = Y.encodeStateVector(doc);
      stampFormatNumber(doc, formatNumber);
      await persistence.store(id, Y.encodeStateAsUpdate(doc, before));
    }
    return id;
  }

  describe('seedMapDoc', () => {
    it('stamps the format number into the new map', async () => {
      const id = nextMapId();

      await seedMapDoc(persistence, id, newRootNode(ROOT_SETTINGS), 3);

      expect(mapFormatNumber(await stored(id))).toBe(3);
    });
  });

  describe('migrateMapDoc', () => {
    const format: MapFormat = {
      formatNumber: 3,
      migrations: [recordingMigration(2), recordingMigration(3)],
    };

    it('runs every migration above the format number of the map, in order', async () => {
      const id = await storeMapOf(1);

      await migrateMapDoc(persistence, id, format);

      expect((await stored(id)).getMap('mapOptions').get('runs')).toEqual([
        2, 3,
      ]);
    });

    it('stamps the format number of the build into the map', async () => {
      const id = await storeMapOf(1);

      await migrateMapDoc(persistence, id, format);

      expect(mapFormatNumber(await stored(id))).toBe(3);
    });

    it('skips the migrations the map already went through', async () => {
      const id = await storeMapOf(2);

      await migrateMapDoc(persistence, id, format);

      expect((await stored(id)).getMap('mapOptions').get('runs')).toEqual([3]);
    });

    it('runs each migration once when the map opens twice', async () => {
      const id = await storeMapOf(1);

      await migrateMapDoc(persistence, id, format);
      await migrateMapDoc(persistence, id, format);

      expect((await stored(id)).getMap('mapOptions').get('runs')).toEqual([
        2, 3,
      ]);
    });

    it('stores nothing for a map on the format number of the build', async () => {
      const id = await storeMapOf(3);
      const before = await persistence.read(id);

      await migrateMapDoc(persistence, id, format);

      expect(await persistence.read(id)).toEqual(before);
    });

    it('leaves the map unchanged when a migration fails', async () => {
      const id = await storeMapOf(1);
      const before = await persistence.read(id);

      await expect(
        migrateMapDoc(persistence, id, {
          formatNumber: 3,
          migrations: [recordingMigration(2), failingMigration(3)],
        })
      ).rejects.toThrow('Migration failed');

      expect(await persistence.read(id)).toEqual(before);
    });

    it('rejects a map that a later build saved, and leaves it unchanged', async () => {
      const id = await storeMapOf(4);
      const before = await persistence.read(id);

      await expect(migrateMapDoc(persistence, id, format)).rejects.toThrow(
        NewerMapFormatError
      );

      expect(await persistence.read(id)).toEqual(before);
    });
  });
});
