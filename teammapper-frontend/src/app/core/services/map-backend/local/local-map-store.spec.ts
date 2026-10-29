import '../../../../../test/fake-indexeddb';
import { TestBed } from '@angular/core/testing';
import localforage from 'localforage';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ToastrService } from 'ngx-toastr';
import { v4 as uuidv4 } from 'uuid';
import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import {
  DEFAULT_ROOT_FONT_SIZE,
  ImageReference,
  MapNodeSettings,
} from '@teammapper/shared';
import { createMockUtilsService } from '../../../../../test/mocks/utils-service.mock';
import { ImageUploadError } from '../../mmp/node-images';
import { UtilsService } from '../../utils/utils.service';
import { nodeEntries, nodesMapOf } from '../../map-sync/yjs-utils';
import {
  LocalMapStore,
  MAP_TOUCH_DEBOUNCE_MS,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_BYTES_PER_MAP,
  UNUSED_IMAGE_RETENTION_DAYS,
} from './local-map-store';
import {
  mapDatabaseName,
  DOC_WRITE_DEBOUNCE_MS,
  Y_INDEXEDDB_LOADER,
} from './doc-persistence';
import { ReportedMapStoreError } from '../map-store';

const ROOT_NODE: MapNodeSettings = {
  name: 'Root',
  link: { href: '' },
  image: { src: '', size: 0 },
  colors: { name: '#111111', background: '#eeeeee', branch: '' },
  font: { size: 0, style: 'italic', weight: 'bold' },
};

const storeOf = (storeName: string) =>
  localforage.createInstance({ name: 'teammapper-offline', storeName });
const records = storeOf('maps');
const images = storeOf('images');
const meta = storeOf('meta');

/** An image of the given size; its content does not matter to the store. */
const imageOfSize = (bytes: number): Blob =>
  new Blob(['x'.repeat(bytes)], { type: 'image/png' });

/** The Y.Doc the browser keeps for the map, loaded into a fresh doc. */
async function storedDoc(mapId: string): Promise<Y.Doc> {
  const doc = new Y.Doc();
  const persistence = new IndexeddbPersistence(mapDatabaseName(mapId), doc);
  await persistence.whenSynced;
  await persistence.destroy();
  return doc;
}

/** The number of updates y-indexeddb holds for the map. */
function storedUpdateCount(mapId: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const opening = indexedDB.open(mapDatabaseName(mapId));
    opening.onerror = () => reject(opening.error);
    opening.onsuccess = () => {
      const database = opening.result;
      const counting = database
        .transaction('updates')
        .objectStore('updates')
        .count();
      counting.onerror = () => reject(counting.error);
      counting.onsuccess = () => {
        database.close();
        resolve(counting.result);
      };
    };
  });
}

const STORAGE_FAILED_TOAST = 'TOASTS.ERRORS.BROWSER_STORAGE_FAILED';
const NEWER_FORMAT_TOAST = 'TOASTS.ERRORS.BROWSER_STORAGE_NEWER_FORMAT';

async function databaseNames(): Promise<(string | undefined)[]> {
  return (await indexedDB.databases()).map(database => database.name);
}

describe('LocalMapStore', () => {
  let store: LocalMapStore;
  let toastr: { error: jest.Mock };
  // Resolves once the store shows its first error toast.
  let toastShown: Promise<void>;
  let persist: jest.Mock;
  let createObjectURL: jest.Mock;
  let revokeObjectURL: jest.Mock;

  beforeEach(async () => {
    await Promise.all([records.clear(), images.clear(), meta.clear()]);
    toastr = { error: jest.fn() };
    toastShown = new Promise(resolve =>
      toastr.error.mockImplementation(() => resolve())
    );
    persist = jest.fn().mockResolvedValue(true);
    Object.defineProperty(navigator, 'storage', {
      value: { persist },
      configurable: true,
    });
    let urls = 0;
    createObjectURL = jest.fn(() => `blob:url-${++urls}`);
    revokeObjectURL = jest.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });

    TestBed.configureTestingModule({
      providers: [
        LocalMapStore,
        { provide: ToastrService, useValue: toastr },
        { provide: UtilsService, useValue: createMockUtilsService() },
        { provide: Y_INDEXEDDB_LOADER, useValue: () => import('y-indexeddb') },
      ],
    });
    store = TestBed.inject(LocalMapStore);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('createMap', () => {
    it('returns a writable map with a generated id, admin id and secret and no deletion date', async () => {
      const created = await store.createMap(ROOT_NODE);

      expect(created.map.uuid).toMatch(/^[0-9a-f-]{36}$/);
      expect(created.adminId).toMatch(/^[0-9a-f-]{36}$/);
      expect(created.modificationSecret).toMatch(/^[0-9a-f-]{36}$/);
      expect(created.map.writable).toBe(true);
      expect(created.map.deletedAt).toBeNull();
      expect(created.map.deleteAfterDays).toBeNull();
    });

    it('returns the root node with the backend defaults filled in', async () => {
      const { map } = await store.createMap(ROOT_NODE);

      expect(map.data).toEqual([
        expect.objectContaining({
          parent: null,
          isRoot: true,
          name: 'Root',
          k: 1,
          coordinates: { x: 0, y: 0 },
          colors: { name: '#111111', background: '#eeeeee', branch: '' },
          font: {
            size: DEFAULT_ROOT_FONT_SIZE,
            style: 'italic',
            weight: 'bold',
          },
          image: { src: '', size: 0 },
          link: { href: '' },
        }),
      ]);
    });

    it('seeds the stored doc with the root node and the map options', async () => {
      const { map } = await store.createMap(ROOT_NODE);

      const doc = await storedDoc(map.uuid);
      const nodes = nodeEntries(nodesMapOf(doc));
      expect(nodes.map(([id]) => id)).toEqual([map.data[0].id]);
      expect(nodes[0][1].get('name')).toBe('Root');
      expect(doc.getMap('mapOptions').get('name')).toBe('');
    });

    it('asks the browser to keep its storage when the first map is created', async () => {
      await store.createMap(ROOT_NODE);
      await store.createMap(ROOT_NODE);

      expect(persist).toHaveBeenCalledTimes(1);
    });
  });

  describe('getMap', () => {
    it('returns the stored map with the nodes of its doc', async () => {
      const created = await store.createMap(ROOT_NODE);

      const map = await store.getMap(
        created.map.uuid,
        created.modificationSecret
      );

      expect(map?.uuid).toBe(created.map.uuid);
      expect(map?.data.map(node => node.name)).toEqual(['Root']);
      expect(map?.deletedAt).toBeNull();
      expect(map?.writable).toBe(true);
    });

    it('opens the map read-only without its secret', async () => {
      const created = await store.createMap(ROOT_NODE);

      const map = await store.getMap(created.map.uuid, '');

      expect(map?.writable).toBe(false);
    });

    it('returns null for an unknown map', async () => {
      expect(await store.getMap('unknown', '')).toBeNull();
    });

    it('adds nothing to the stored doc when it reads the map', async () => {
      const created = await store.createMap(ROOT_NODE);
      const before = await storedUpdateCount(created.map.uuid);

      await store.getMap(created.map.uuid, created.modificationSecret);
      await store.getMap(created.map.uuid, created.modificationSecret);

      expect(await storedUpdateCount(created.map.uuid)).toBe(before);
    });

    it('reads a map without content as empty and creates no database for it', async () => {
      const { map, modificationSecret } = await store.createMap(ROOT_NODE);
      await (await store.docPersistence()).delete(map.uuid);

      const read = await store.getMap(map.uuid, modificationSecret);

      expect(read?.data).toEqual([]);
      expect(await databaseNames()).not.toContain(mapDatabaseName(map.uuid));
    });
  });

  describe('listMaps', () => {
    it('lists every stored map with its root name and no deletion date', async () => {
      const first = await store.createMap(ROOT_NODE);
      const second = await store.createMap({ ...ROOT_NODE, name: 'Other' });

      const listed = await store.listMaps();

      expect(listed).toHaveLength(2);
      expect(listed).toEqual(
        expect.arrayContaining([
          {
            id: first.map.uuid,
            cachedAdminMapValue: {
              adminId: first.adminId,
              modificationSecret: first.modificationSecret,
              ttl: null,
              rootName: 'Root',
            },
          },
          expect.objectContaining({
            id: second.map.uuid,
            cachedAdminMapValue: expect.objectContaining({ rootName: 'Other' }),
          }),
        ])
      );
    });
  });

  describe('deleteMap', () => {
    it('removes the record, the images and the doc of the map', async () => {
      const { map, adminId, modificationSecret } =
        await store.createMap(ROOT_NODE);
      await store.uploadImage(map.uuid, imageOfSize(10), modificationSecret);

      expect(await store.deleteMap(map.uuid, adminId)).toBe(true);

      expect(await store.getMap(map.uuid, modificationSecret)).toBeNull();
      expect(await images.keys()).toEqual([]);
      expect(await databaseNames()).not.toContain(mapDatabaseName(map.uuid));
    });

    it('refuses a wrong admin id and keeps the map', async () => {
      const { map, modificationSecret } = await store.createMap(ROOT_NODE);

      expect(await store.deleteMap(map.uuid, 'wrong')).toBe(false);

      expect(await store.getMap(map.uuid, modificationSecret)).not.toBeNull();
    });

    it('keeps the images of other maps', async () => {
      const kept = await store.createMap(ROOT_NODE);
      const deleted = await store.createMap(ROOT_NODE);
      await store.uploadImage(kept.map.uuid, imageOfSize(10), '');

      await store.deleteMap(deleted.map.uuid, deleted.adminId);

      expect(await images.length()).toBe(1);
    });

    it('keeps all content when the record cannot be deleted, and allows a retry', async () => {
      const { map, adminId, modificationSecret } =
        await store.createMap(ROOT_NODE);
      const image = new Blob(
        [
          readFileSync(
            join(__dirname, '../../../../../assets/icons/teammapper.svg'),
            'utf8'
          ),
        ],
        { type: 'image/svg+xml' }
      );
      await store.uploadImage(map.uuid, image, '');
      const keys = await images.keys();
      const remove = jest
        .spyOn(IDBObjectStore.prototype, 'delete')
        .mockImplementationOnce(() => {
          throw new DOMException('Blocked', 'UnknownError');
        });

      expect(await store.deleteMap(map.uuid, adminId)).toBe(false);
      remove.mockRestore();

      const reloaded = TestBed.runInInjectionContext(() => new LocalMapStore());
      expect((await reloaded.listMaps()).map(entry => entry.id)).toEqual([
        map.uuid,
      ]);
      expect(
        (await reloaded.getMap(map.uuid, modificationSecret))?.data
      ).toEqual(map.data);
      expect(await images.keys()).toEqual(keys);
      expect(await store.deleteMap(map.uuid, adminId)).toBe(true);
      expect(await records.keys()).toEqual([]);
      expect(await images.keys()).toEqual([]);
    });

    it('commits deletion even when content cleanup fails', async () => {
      const { map, adminId, modificationSecret } =
        await store.createMap(ROOT_NODE);
      const persistence = await store.docPersistence();
      jest.spyOn(persistence, 'delete').mockRejectedValue(new Error('Blocked'));

      expect(await store.deleteMap(map.uuid, adminId)).toBe(true);

      expect(await store.listMaps()).toEqual([]);
      expect(await store.getMap(map.uuid, modificationSecret)).toBeNull();
    });

    it('commits deletion even when image cleanup fails', async () => {
      const { map, adminId, modificationSecret } =
        await store.createMap(ROOT_NODE);
      const image = new Blob(
        [
          readFileSync(
            join(__dirname, '../../../../../assets/icons/teammapper.svg'),
            'utf8'
          ),
        ],
        { type: 'image/svg+xml' }
      );
      await store.uploadImage(map.uuid, image, '');
      const originalDelete = IDBObjectStore.prototype.delete;
      jest
        .spyOn(IDBObjectStore.prototype, 'delete')
        .mockImplementation(function (this: IDBObjectStore, key) {
          if (this.name === 'images')
            throw new DOMException('Blocked', 'UnknownError');
          return originalDelete.call(this, key);
        });

      expect(await store.deleteMap(map.uuid, adminId)).toBe(true);

      expect(await store.listMaps()).toEqual([]);
      expect(await store.getMap(map.uuid, modificationSecret)).toBeNull();
      expect(await databaseNames()).not.toContain(mapDatabaseName(map.uuid));
    });
  });

  describe('node images', () => {
    let mapId: string;

    beforeEach(async () => {
      mapId = (await store.createMap(ROOT_NODE)).map.uuid;
    });

    it('returns an image reference for a stored image', async () => {
      const reference = await store.uploadImage(mapId, imageOfSize(10), '');

      expect(reference).toMatch(/^image:[0-9a-f-]{36}$/);
    });

    it('accepts an image of exactly the size limit', async () => {
      await expect(
        store.uploadImage(mapId, imageOfSize(MAX_IMAGE_BYTES), '')
      ).resolves.toBeDefined();
    });

    it('rejects an image above 150,000 bytes with status 413', async () => {
      expect(MAX_IMAGE_BYTES).toBe(150_000);

      await expect(
        store.uploadImage(mapId, imageOfSize(MAX_IMAGE_BYTES + 1), '')
      ).rejects.toEqual(new ImageUploadError(413));
    });

    it('rejects an image that takes the map above 2,000,000 bytes with status 413', async () => {
      expect(MAX_IMAGE_BYTES_PER_MAP).toBe(2_000_000);
      for (let i = 0; i < 13; i++) {
        await store.uploadImage(mapId, imageOfSize(MAX_IMAGE_BYTES), '');
      }

      await expect(
        store.uploadImage(mapId, imageOfSize(50_001), '')
      ).rejects.toEqual(new ImageUploadError(413));
      await expect(
        store.uploadImage(mapId, imageOfSize(50_000), '')
      ).resolves.toBeDefined();
    });

    it('resolves a preloaded image to an object URL', async () => {
      const reference = await store.uploadImage(mapId, imageOfSize(10), '');
      store.releaseImages();

      expect(store.imageUrl(mapId, reference)).toBeNull();
      await store.preloadImages(mapId);

      expect(store.imageUrl(mapId, reference)).toMatch(/^blob:/);
    });

    // WebKit refuses to store a Blob in IndexedDB in a private window.
    it('stores the bytes of an image instead of a Blob', async () => {
      await store.uploadImage(mapId, imageOfSize(10), '');

      const [key] = await images.keys();
      const record = await images.getItem<{ data: unknown }>(key);
      expect(Object.prototype.toString.call(record?.data)).toBe(
        '[object ArrayBuffer]'
      );
    });

    it('preloads a stored image as a Blob of its type', async () => {
      await store.uploadImage(mapId, imageOfSize(10), '');
      createObjectURL.mockClear();

      await store.preloadImages(mapId);

      const [image] = createObjectURL.mock.calls[0];
      expect(image).toBeInstanceOf(Blob);
      expect(image.type).toBe('image/png');
      expect(image.size).toBe(10);
    });

    it('resolves an image uploaded to the open map at once', async () => {
      await store.preloadImages(mapId);

      const reference = await store.uploadImage(mapId, imageOfSize(10), '');

      expect(store.imageUrl(mapId, reference)).toMatch(/^blob:/);
    });

    it('returns null for an unknown image', async () => {
      await store.preloadImages(mapId);
      const unknown: ImageReference =
        'image:aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

      expect(store.imageUrl(mapId, unknown)).toBeNull();
    });

    it('records the upload time of a new image', async () => {
      const now = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(now);

      await store.uploadImage(mapId, imageOfSize(10), '');

      const [key] = await images.keys();
      const record = await images.getItem<{ uploadedAt: string }>(key);
      expect(record?.uploadedAt).toBe(new Date(now).toISOString());
    });

    describe('when the images of the map load', () => {
      const RETENTION_MS = UNUSED_IMAGE_RETENTION_DAYS * 24 * 60 * 60 * 1000;
      const uploadTime = Date.now();

      /** Lets `ms` pass since the uploads. */
      const passTime = (ms: number) =>
        jest.spyOn(Date, 'now').mockReturnValue(uploadTime + ms);

      /** Stores `src` as the main root's image in the map's doc. */
      async function setRootImage(src: string): Promise<void> {
        const doc = new Y.Doc();
        const stored = await (await store.docPersistence()).attach(mapId, doc);
        const [, root] = nodeEntries(nodesMapOf(doc))[0];
        root.set('image', new Y.Map(Object.entries({ src, size: 10 })));
        await stored.close();
      }

      beforeEach(() => {
        passTime(0);
      });

      it('deletes an image no node references once 7 days have passed since its upload', async () => {
        expect(UNUSED_IMAGE_RETENTION_DAYS).toBe(7);
        const used = await store.uploadImage(mapId, imageOfSize(10), '');
        const unused = await store.uploadImage(mapId, imageOfSize(10), '');
        await setRootImage(used);
        passTime(RETENTION_MS + 1);

        await store.preloadImages(mapId);

        expect(store.imageUrl(mapId, used)).toMatch(/^blob:/);
        expect(store.imageUrl(mapId, unused)).toBeNull();
        expect(await images.length()).toBe(1);
      });

      // Undo may restore the image within that time.
      it('keeps an image no node references within 7 days of its upload', async () => {
        const unused = await store.uploadImage(mapId, imageOfSize(10), '');
        passTime(RETENTION_MS - 1);

        await store.preloadImages(mapId);

        expect(store.imageUrl(mapId, unused)).toMatch(/^blob:/);
        expect(await images.length()).toBe(1);
      });

      it('counts an image stored without an upload time as uploaded on its first load', async () => {
        const key = `${mapId}/${uuidv4()}`;
        const data = await imageOfSize(10).arrayBuffer();
        await images.setItem(key, { mimetype: 'image/png', size: 10, data });
        passTime(RETENTION_MS * 10);

        await store.preloadImages(mapId);
        expect(await images.keys()).toEqual([key]);
        passTime(RETENTION_MS * 11 + 1);
        await store.preloadImages(mapId);

        expect(await images.keys()).toEqual([]);
      });

      it('keeps the images of other maps', async () => {
        const other = (await store.createMap(ROOT_NODE)).map.uuid;
        await store.uploadImage(other, imageOfSize(10), '');
        passTime(RETENTION_MS + 1);

        await store.preloadImages(mapId);

        expect(await images.length()).toBe(1);
      });
    });

    it('creates no object URL when the images are released while they load', async () => {
      await store.uploadImage(mapId, imageOfSize(10), '');
      createObjectURL.mockClear();

      const loading = store.preloadImages(mapId);
      store.releaseImages();
      await loading;

      expect(createObjectURL).not.toHaveBeenCalled();
    });

    it('revokes the object URLs when the images are released', async () => {
      const reference = await store.uploadImage(mapId, imageOfSize(10), '');
      await store.preloadImages(mapId);
      const url = store.imageUrl(mapId, reference);

      store.releaseImages();

      expect(revokeObjectURL).toHaveBeenCalledWith(url);
      expect(store.imageUrl(mapId, reference)).toBeNull();
    });
  });

  describe('watching the open map', () => {
    beforeEach(() => {
      jest.useFakeTimers({
        doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'],
      });
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('updates the root name and last modification a second after an edit', async () => {
      const { map } = await store.createMap(ROOT_NODE);
      const doc = await storedDoc(map.uuid);
      const before = await records.getItem<{ lastModified: string }>(map.uuid);
      const stop = store.watchMap(map.uuid, doc);

      jest.setSystemTime(Date.now() + 60_000);
      renameRootOf(doc, 'Renamed');
      await jest.advanceTimersByTimeAsync(MAP_TOUCH_DEBOUNCE_MS - 1);
      expect((await store.listMaps())[0].cachedAdminMapValue.rootName).toBe(
        'Root'
      );
      await jest.advanceTimersByTimeAsync(1);

      const after = await records.getItem<{ lastModified: string }>(map.uuid);
      expect((await store.listMaps())[0].cachedAdminMapValue.rootName).toBe(
        'Renamed'
      );
      expect(after?.lastModified).not.toBe(before?.lastModified);
      await stop();
    });

    it('brings back no map that was deleted while an edit was pending', async () => {
      const { map, adminId } = await store.createMap(ROOT_NODE);
      const doc = await storedDoc(map.uuid);
      const stop = store.watchMap(map.uuid, doc);
      renameRootOf(doc, 'Renamed');

      const deleted = store.deleteMap(map.uuid, adminId);
      const touched = stop();

      expect(await deleted).toBe(true);
      await touched;
      expect(await records.keys()).toEqual([]);
    });

    it('writes a pending update when the watch stops', async () => {
      const { map } = await store.createMap(ROOT_NODE);
      const doc = await storedDoc(map.uuid);
      const stop = store.watchMap(map.uuid, doc);

      renameRootOf(doc, 'Renamed');
      await stop();

      expect((await store.listMaps())[0].cachedAdminMapValue.rootName).toBe(
        'Renamed'
      );
    });
  });

  describe('format number', () => {
    it('stamps format number 1 on first access', async () => {
      await store.listMaps();

      expect(await meta.getItem('formatNumber')).toBe(1);
    });

    it('retries the first access after it failed for another reason', async () => {
      const created = await store.createMap(ROOT_NODE);
      const reloaded = TestBed.runInInjectionContext(() => new LocalMapStore());
      jest.spyOn(IDBObjectStore.prototype, 'get').mockImplementationOnce(() => {
        throw new DOMException('Busy', 'UnknownError');
      });

      expect(await reloaded.listMaps()).toEqual([]);

      const listed = await reloaded.listMaps();
      expect(listed.map(entry => entry.id)).toEqual([created.map.uuid]);
    });

    describe('when the stored data has a newer format', () => {
      let created: Awaited<ReturnType<LocalMapStore['createMap']>>;
      let blocked: LocalMapStore;

      beforeEach(async () => {
        created = await store.createMap(ROOT_NODE);
        await meta.setItem('formatNumber', 2);
        blocked = TestBed.runInInjectionContext(() => new LocalMapStore());
      });

      it('lists no map and shows the newer format toast', async () => {
        expect(await blocked.listMaps()).toEqual([]);
        await toastShown;

        expect(toastr.error).toHaveBeenCalledWith(NEWER_FORMAT_TOAST);
      });

      // The caller recognises the error and shows no toast of its own.
      it('refuses to open a map with an error that reports the toast as shown', async () => {
        await expect(
          blocked.getMap(created.map.uuid, created.modificationSecret)
        ).rejects.toBeInstanceOf(ReportedMapStoreError);
      });

      it('shows the toast once for every access', async () => {
        await blocked.listMaps();
        await blocked
          .getMap(created.map.uuid, created.modificationSecret)
          .catch(() => undefined);
        await blocked.deleteMap(created.map.uuid, created.adminId);
        await toastShown;

        expect(toastr.error).toHaveBeenCalledTimes(1);
      });

      it('creates and deletes nothing and leaves the format number', async () => {
        await expect(blocked.createMap(ROOT_NODE)).rejects.toBeInstanceOf(
          ReportedMapStoreError
        );
        expect(await blocked.deleteMap(created.map.uuid, created.adminId)).toBe(
          false
        );

        expect(await records.length()).toBe(1);
        expect(await meta.getItem('formatNumber')).toBe(2);
      });

      it('stores no image', async () => {
        await expect(
          blocked.uploadImage(created.map.uuid, imageOfSize(10), '')
        ).rejects.toBeInstanceOf(ReportedMapStoreError);
        expect(await images.length()).toBe(0);
      });
    });
  });

  describe('a failed write', () => {
    let mapId: string;

    beforeEach(async () => {
      mapId = (await store.createMap(ROOT_NODE)).map.uuid;
      jest.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
        throw new DOMException('Quota exceeded', 'QuotaExceededError');
      });
    });

    it('shows the storage toast when a map cannot be created', async () => {
      await expect(store.createMap(ROOT_NODE)).rejects.toThrow();
      await toastShown;

      expect(toastr.error).toHaveBeenCalledWith(STORAGE_FAILED_TOAST);
    });

    // The upload error toast of mmp would repeat the message.
    it('shows the storage toast when an image cannot be stored', async () => {
      await expect(
        store.uploadImage(mapId, imageOfSize(10), '')
      ).rejects.toBeInstanceOf(ReportedMapStoreError);
      await toastShown;

      expect(toastr.error).toHaveBeenCalledWith(STORAGE_FAILED_TOAST);
    });

    it('shows the storage toast when the open map cannot be updated', async () => {
      const doc = await storedDoc(mapId);
      const stop = store.watchMap(mapId, doc);
      doc.getMap('nodes').set('edited', true);

      // Stopping writes the pending update at once.
      await stop();
      await toastShown;

      expect(toastr.error).toHaveBeenCalledWith(STORAGE_FAILED_TOAST);
    });
  });

  describe('a failed seed', () => {
    beforeEach(async () => {
      // Stamps the format number before the write fails.
      await store.listMaps();
      // y-indexeddb adds each update with add(), localforage writes with put().
      jest.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(() => {
        throw new DOMException('Quota exceeded', 'QuotaExceededError');
      });
    });

    it('stores no record and shows the storage toast', async () => {
      await expect(store.createMap(ROOT_NODE)).rejects.toBeInstanceOf(
        ReportedMapStoreError
      );
      await toastShown;

      expect(await records.length()).toBe(0);
      expect(toastr.error).toHaveBeenCalledWith(STORAGE_FAILED_TOAST);
    });
  });

  // localforage falls back to localStorage where IndexedDB is missing, and
  // the docs follow it there.
  describe('on the localStorage driver', () => {
    let fallback: LocalMapStore;
    let docs: LocalForage;

    beforeEach(() => {
      localStorage.clear();
      const createInstance = localforage.createInstance.bind(localforage);
      jest
        .spyOn(localforage, 'createInstance')
        .mockImplementation(options =>
          createInstance({ ...options, driver: localforage.LOCALSTORAGE })
        );
      docs = storeOf('docs');
      fallback = TestBed.runInInjectionContext(() => new LocalMapStore());
    });

    /** Opens the map's stored doc the way a connection does. */
    async function attach(mapId: string) {
      const doc = new Y.Doc();
      const persistence = await fallback.docPersistence();
      return { doc, stored: await persistence.attach(mapId, doc) };
    }

    it('creates a map and reads its content back, outside IndexedDB', async () => {
      const { map, modificationSecret } = await fallback.createMap(ROOT_NODE);

      const read = await fallback.getMap(map.uuid, modificationSecret);

      expect(read?.data.map(node => node.name)).toEqual(['Root']);
      expect(await docs.keys()).toEqual([map.uuid]);
      expect(await databaseNames()).not.toContain(mapDatabaseName(map.uuid));
    });

    it('reads the map after a reload', async () => {
      const { map, modificationSecret } = await fallback.createMap(ROOT_NODE);

      const reloaded = TestBed.runInInjectionContext(() => new LocalMapStore());

      const read = await reloaded.getMap(map.uuid, modificationSecret);
      expect(read?.data.map(node => node.name)).toEqual(['Root']);
    });

    it('merges the edits of two docs on the same map', async () => {
      const { map, modificationSecret } = await fallback.createMap(ROOT_NODE);
      const tabA = await attach(map.uuid);
      const tabB = await attach(map.uuid);

      renameRootOf(tabA.doc, 'From A');
      tabB.doc.getMap('mapOptions').set('fontMaxSize', 42);
      await tabA.stored.close();
      await tabB.stored.close();

      const read = await fallback.getMap(map.uuid, modificationSecret);
      expect(read?.data.map(node => node.name)).toEqual(['From A']);
      expect(read?.options.fontMaxSize).toBe(42);
    });

    it('writes an edit once the doc has had no update for a while', async () => {
      const { map, modificationSecret } = await fallback.createMap(ROOT_NODE);
      const tab = await attach(map.uuid);
      jest.useFakeTimers({
        doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'],
      });

      renameRootOf(tab.doc, 'Renamed');
      await jest.advanceTimersByTimeAsync(DOC_WRITE_DEBOUNCE_MS);
      jest.useRealTimers();

      const read = await fallback.getMap(map.uuid, modificationSecret);
      expect(read?.data.map(node => node.name)).toEqual(['Renamed']);
      await tab.stored.close();
    });

    it('deletes the content with the map', async () => {
      const { map, adminId } = await fallback.createMap(ROOT_NODE);

      expect(await fallback.deleteMap(map.uuid, adminId)).toBe(true);

      expect(await docs.keys()).toEqual([]);
    });

    it('shows the storage toast when the doc cannot be written', async () => {
      const { map } = await fallback.createMap(ROOT_NODE);
      const tab = await attach(map.uuid);
      jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('Quota exceeded', 'QuotaExceededError');
      });

      renameRootOf(tab.doc, 'Renamed');
      await tab.stored.close();
      await toastShown;

      expect(toastr.error).toHaveBeenCalledWith(STORAGE_FAILED_TOAST);
    });
  });
});

function renameRootOf(doc: Y.Doc, name: string): void {
  doc.transact(() => {
    const [, root] = nodeEntries(nodesMapOf(doc))[0];
    root.set('name', name);
  });
}
