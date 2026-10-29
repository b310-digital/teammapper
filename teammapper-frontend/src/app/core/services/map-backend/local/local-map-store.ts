import { Injectable, inject } from '@angular/core';
import {
  CachedAdminMapEntry,
  ImageReference,
  imageIdOf,
  isImageReference,
  toImageReference,
  UserMapOptions,
} from '@teammapper/shared';
import localforage from 'localforage';
import { ToastrService } from 'ngx-toastr';
import { v4 as uuidv4 } from 'uuid';
import * as Y from 'yjs';
import { PrivateServerMap, ServerMap } from '../../map-sync/server-types';
import { ImageUploadError } from '../../mmp/node-images';
import { UtilsService } from '../../utils/utils.service';
import { MapStore, ReportedMapStoreError } from '../map-store';
import {
  chooseDocPersistence,
  DocPersistence,
  Y_INDEXEDDB_LOADER,
} from './doc-persistence';
import {
  MapContent,
  mainRootName,
  newRootNode,
  readMapDoc,
  seedMapDoc,
} from './map-database';

/** The backend's default limit for one image. */
export const MAX_IMAGE_BYTES = 150_000;
/** The backend's default limit for the images of one map. */
export const MAX_IMAGE_BYTES_PER_MAP = 2_000_000;
/**
 * The days an image no node references stays stored after its upload, so
 * undo can restore it. Matches the backend's UNUSED_IMAGE_RETENTION_DAYS.
 */
export const UNUSED_IMAGE_RETENTION_DAYS = 7;
/** How long the open map stays unchanged before its record follows it. */
export const MAP_TOUCH_DEBOUNCE_MS = 1000;

/** The version of the stored data that this build reads and writes. */
const FORMAT_NUMBER = 1;
const FORMAT_NUMBER_KEY = 'formatNumber';
const FORMAT_ERROR = 'TOASTS.ERRORS.BROWSER_STORAGE_NEWER_FORMAT';
const WRITE_ERROR = 'TOASTS.ERRORS.BROWSER_STORAGE_FAILED';

/** What the store keeps of a map besides its Y.Doc. */
interface LocalMapRecord {
  uuid: string;
  adminId: string;
  modificationSecret: string;
  createdAt: string;
  lastModified: string;
  rootName: string | null;
}

/**
 * The image keeps its bytes rather than a Blob, because WebKit refuses to
 * store a Blob in IndexedDB in a private window.
 */
interface LocalImageRecord {
  mimetype: string;
  size: number;
  data: ArrayBuffer;
  uploadedAt: string;
}

/** An image record as read back, which may predate the upload time. */
type StoredImageRecord = Omit<LocalImageRecord, 'uploadedAt'> &
  Partial<Pick<LocalImageRecord, 'uploadedAt'>>;

interface StoredImage {
  key: string;
  image: StoredImageRecord;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Blocks every access to stored maps that a later build wrote. */
class NewerFormatError extends ReportedMapStoreError {}

const createStore = (storeName: string): LocalForage =>
  localforage.createInstance({ name: 'teammapper-offline', storeName });

/** Images are keyed by map, so a prefix finds every image of a map. */
const imageKey = (mapId: string, imageId: string): string =>
  `${mapId}/${imageId}`;

/**
 * Keeps maps and their node images in the browser. A map's record, its
 * images and its Y.Doc go to three places:
 * - the record to the `maps` store of the `teammapper-offline` database
 * - the images to its `images` store
 * - the Y.Doc to the `DocPersistence` that `docPersistence` picks, which
 *   `LocalMapConnection` writes as well
 *
 * The store generates the admin id and the modification secret, so the map
 * list, deletion and edit mode run the same code as on the web. Every access
 * first checks the format number in the `meta` store, and a format newer
 * than this build reads blocks the store.
 */
@Injectable()
export class LocalMapStore implements MapStore {
  private toastrService = inject(ToastrService);
  private utilsService = inject(UtilsService);
  private loadYIndexeddb = inject(Y_INDEXEDDB_LOADER);

  private readonly maps = createStore('maps');
  private readonly images = createStore('images');
  private readonly meta = createStore('meta');
  private readonly docs = createStore('docs');
  private access: Promise<void> | null = null;
  private persistence: Promise<DocPersistence> | null = null;
  // The object URLs of the open map's images, by image key.
  private readonly objectUrls = new Map<string, string>();
  // Counts the releases, so a load that a release overtook keeps nothing.
  private imageGeneration = 0;
  // The maps this store deleted, which a pending record update skips.
  private readonly deletedMaps = new Set<string>();

  /**
   * Seeds the map's doc before it writes the record, so a failed write
   * leaves no map in the list without content. A failed write shows the
   * storage toast and rejects with a `ReportedMapStoreError`.
   */
  async createMap(
    rootNode: UserMapOptions['rootNode']
  ): Promise<PrivateServerMap> {
    await this.checkAccess();
    const isFirstMap = (await this.maps.length()) === 0;
    const root = newRootNode(rootNode);
    const record = newRecord(root.name ?? null);
    const persistence = await this.docPersistence();
    await this.write(() => seedMapDoc(persistence, record.uuid, root));
    await this.write(() => this.maps.setItem(record.uuid, record));
    if (isFirstMap) requestPersistentStorage();
    const content = { data: [root], arrows: [], options: {} };
    return {
      map: toServerMap(record, content, true),
      adminId: record.adminId,
      modificationSecret: record.modificationSecret,
    };
  }

  /**
   * Opens the map read-only unless the secret matches. Rejects with a
   * `ReportedMapStoreError` when the stored format blocks access, so the
   * caller adds no "not found" toast to the one the store showed.
   */
  async getMap(
    uuid: string,
    modificationSecret: string
  ): Promise<ServerMap | null> {
    try {
      await this.checkAccess();
      const record = await this.maps.getItem<LocalMapRecord>(uuid);
      if (!record) return null;
      const writable = modificationSecret === record.modificationSecret;
      const content = await readMapDoc(await this.docPersistence(), uuid);
      return toServerMap(record, content, writable);
    } catch (error) {
      if (error instanceof ReportedMapStoreError) throw error;
      console.error('Failed to load the map:', error);
      return null;
    }
  }

  /** Every stored map, the last modified first. */
  async listMaps(): Promise<CachedAdminMapEntry[]> {
    try {
      await this.checkAccess();
      const records = await this.allRecords();
      records.sort((a, b) => b.lastModified.localeCompare(a.lastModified));
      return records.map(toAdminEntry);
    } catch (error) {
      console.error('Failed to list the maps:', error);
      return [];
    }
  }

  async deleteMap(uuid: string, adminId: string): Promise<boolean> {
    try {
      await this.checkAccess();
      const record = await this.maps.getItem<LocalMapRecord>(uuid);
      if (record?.adminId !== adminId) return false;
      await this.removeMap(uuid);
      return true;
    } catch (error) {
      console.error('Failed to delete the map:', error);
      return false;
    }
  }

  /**
   * Stores the image within the backend's default limits. A failed write
   * shows the storage toast and rejects with a `ReportedMapStoreError`. The
   * secret has no use here: a map opened without it is read-only and uploads
   * nothing.
   */
  async uploadImage(
    mapId: string,
    image: Blob,
    _modificationSecret: string
  ): Promise<ImageReference> {
    await this.checkImageLimits(mapId, image);
    const imageId = uuidv4();
    const key = imageKey(mapId, imageId);
    const record: LocalImageRecord = {
      mimetype: image.type,
      size: image.size,
      data: await image.arrayBuffer(),
      uploadedAt: new Date(Date.now()).toISOString(),
    };
    await this.write(() => this.images.setItem(key, record));
    this.objectUrls.set(key, URL.createObjectURL(image));
    return toImageReference(imageId);
  }

  /** The object URL of a preloaded or uploaded image, null for any other. */
  imageUrl(mapId: string, reference: ImageReference): string | null {
    return this.objectUrls.get(imageKey(mapId, imageIdOf(reference))) ?? null;
  }

  /**
   * Deletes the map's unused images, as the backend's cleanup job does, and
   * turns every other stored image of the map into an object URL.
   */
  async preloadImages(mapId: string): Promise<void> {
    this.releaseImages();
    const generation = this.imageGeneration;
    try {
      const images = await this.removeUnusedImages(
        mapId,
        await this.storedImagesOf(mapId)
      );
      // A release while the images loaded closed the map they belong to.
      if (generation !== this.imageGeneration) return;
      for (const { key, image } of images) {
        const blob = new Blob([image.data], { type: image.mimetype });
        this.objectUrls.set(key, URL.createObjectURL(blob));
      }
    } catch (error) {
      console.error('Failed to load the images of the map:', error);
    }
  }

  releaseImages(): void {
    this.imageGeneration++;
    this.objectUrls.forEach(url => URL.revokeObjectURL(url));
    this.objectUrls.clear();
  }

  /**
   * Updates the root name and the last modification of the map's record
   * once the open map's doc has had no local edit for a second. A stored
   * update that the doc persistence loads is no edit. The returned function
   * stops watching and writes a pending update at once, and resolves once
   * that write is done.
   */
  watchMap(mapId: string, doc: Y.Doc): () => Promise<void> {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const touch = () => {
      timer = null;
      return this.touchMap(mapId, mainRootName(doc));
    };
    const onUpdate = (...[, , , transaction]: UpdateArgs) => {
      if (!transaction.local) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void touch(), MAP_TOUCH_DEBOUNCE_MS);
    };
    doc.on('update', onUpdate);
    return () => {
      doc.off('update', onUpdate);
      if (timer === null) return Promise.resolve();
      clearTimeout(timer);
      return touch();
    };
  }

  /**
   * The storage of the maps' docs, picked once from the driver localforage
   * chose. A failed write of an open doc shows the storage toast.
   */
  docPersistence(): Promise<DocPersistence> {
    this.persistence ??= chooseDocPersistence(
      this.loadYIndexeddb,
      this.docs,
      error => this.reportWriteError(error)
    );
    return this.persistence;
  }

  /**
   * Resolves once the stored format is one this build reads, stamping the
   * format on first access. Rejects for good, with one error toast, when
   * the stored format is newer. Any other failure lets the next access
   * check again.
   */
  private checkAccess(): Promise<void> {
    this.access ??= this.checkFormatNumber().catch((error: unknown) => {
      if (!(error instanceof NewerFormatError)) this.access = null;
      throw error;
    });
    return this.access;
  }

  private async checkFormatNumber(): Promise<void> {
    const stored = await this.meta.getItem<number>(FORMAT_NUMBER_KEY);
    if (stored === null) {
      await this.write(() =>
        this.meta.setItem(FORMAT_NUMBER_KEY, FORMAT_NUMBER)
      );
    } else if (stored > FORMAT_NUMBER) {
      void this.showError(FORMAT_ERROR);
      throw new NewerFormatError(
        `The stored maps have the newer format ${stored}`
      );
    }
  }

  /**
   * Runs the write. A failure, such as a full storage quota, shows the
   * storage toast and rejects with a `ReportedMapStoreError`.
   */
  private async write<T>(write: () => Promise<T>): Promise<T> {
    try {
      return await write();
    } catch (error) {
      this.reportWriteError(error);
      throw new ReportedMapStoreError('The browser storage write failed');
    }
  }

  private reportWriteError(error: unknown): void {
    console.error('Failed to write to browser storage:', error);
    void this.showError(WRITE_ERROR);
  }

  private async showError(key: string): Promise<void> {
    this.toastrService.error(await this.utilsService.translate(key));
  }

  private async allRecords(): Promise<LocalMapRecord[]> {
    const records: LocalMapRecord[] = [];
    await this.maps.iterate<LocalMapRecord, void>(record => {
      records.push(record);
    });
    return records;
  }

  /**
   * Deletes the content and the images before the record, so a failed
   * deletion leaves the map listed for another try.
   */
  private async removeMap(uuid: string): Promise<void> {
    this.deletedMaps.add(uuid);
    try {
      await (await this.docPersistence()).delete(uuid);
      const keys = await this.imageKeysOf(uuid);
      await Promise.all(keys.map(key => this.images.removeItem(key)));
      await this.maps.removeItem(uuid);
    } catch (error) {
      this.deletedMaps.delete(uuid);
      throw error;
    }
  }

  private async imageKeysOf(mapId: string): Promise<string[]> {
    const keys = await this.images.keys();
    return keys.filter(key => key.startsWith(imageKey(mapId, '')));
  }

  private async storedImagesOf(mapId: string): Promise<StoredImage[]> {
    const stored: StoredImage[] = [];
    await this.images.iterate<StoredImageRecord, void>((image, key) => {
      if (key.startsWith(imageKey(mapId, ''))) stored.push({ key, image });
    });
    return stored;
  }

  /**
   * Deletes the images that no node of the map references and that were
   * uploaded more than `UNUSED_IMAGE_RETENTION_DAYS` ago, and returns the
   * others. A failure keeps every image.
   */
  private async removeUnusedImages(
    mapId: string,
    images: StoredImage[]
  ): Promise<StoredImage[]> {
    try {
      const unused = await this.unusedImages(mapId, images);
      await Promise.all(unused.map(({ key }) => this.images.removeItem(key)));
      return images.filter(image => !unused.includes(image));
    } catch (error) {
      console.error('Failed to delete the unused images of the map:', error);
      return images;
    }
  }

  /**
   * The images no node references, past their retention. An image stored
   * without an upload time gets the current time as its upload time.
   */
  private async unusedImages(
    mapId: string,
    images: StoredImage[]
  ): Promise<StoredImage[]> {
    const referenced = await this.referencedImageKeys(mapId);
    const unreferenced = images.filter(({ key }) => !referenced.has(key));
    await this.stampUploadTimes(unreferenced);
    const uploadedBefore = Date.now() - UNUSED_IMAGE_RETENTION_DAYS * DAY_MS;
    return unreferenced.filter(
      ({ image }) =>
        image.uploadedAt !== undefined &&
        Date.parse(image.uploadedAt) < uploadedBefore
    );
  }

  /** The keys of the images the nodes of the map's stored doc reference. */
  private async referencedImageKeys(mapId: string): Promise<Set<string>> {
    const { data } = await readMapDoc(await this.docPersistence(), mapId);
    const keys = data
      .map(node => node.image?.src)
      .filter(isImageReference)
      .map(reference => imageKey(mapId, imageIdOf(reference)));
    return new Set(keys);
  }

  private async stampUploadTimes(images: StoredImage[]): Promise<void> {
    const uploadedAt = new Date(Date.now()).toISOString();
    const unstamped = images.filter(({ image }) => !image.uploadedAt);
    await Promise.all(
      unstamped.map(({ key, image }) =>
        this.images.setItem(key, { ...image, uploadedAt })
      )
    );
  }

  /** Throws status 413, as the backend answers, for an image too large. */
  private async checkImageLimits(mapId: string, image: Blob): Promise<void> {
    await this.checkAccess();
    if (image.size > MAX_IMAGE_BYTES) throw new ImageUploadError(413);
    const stored = await this.storedImageBytes(mapId);
    if (stored + image.size > MAX_IMAGE_BYTES_PER_MAP) {
      throw new ImageUploadError(413);
    }
  }

  private async storedImageBytes(mapId: string): Promise<number> {
    let bytes = 0;
    await this.images.iterate<LocalImageRecord, void>((image, key) => {
      if (key.startsWith(imageKey(mapId, ''))) bytes += image.size;
    });
    return bytes;
  }

  private async touchMap(mapId: string, rootName: string | null) {
    const record = await this.maps.getItem<LocalMapRecord>(mapId);
    if (!record || this.deletedMaps.has(mapId)) return;
    const lastModified = new Date().toISOString();
    await this.write(() =>
      this.maps.setItem(mapId, { ...record, rootName, lastModified })
    ).catch(() => undefined);
  }
}

type UpdateArgs = [Uint8Array, unknown, Y.Doc, Y.Transaction];

function newRecord(rootName: string | null): LocalMapRecord {
  const now = new Date().toISOString();
  return {
    uuid: uuidv4(),
    adminId: uuidv4(),
    modificationSecret: uuidv4(),
    createdAt: now,
    lastModified: now,
    rootName,
  };
}

/** A map in the browser never expires, so it has no deletion date. */
function toServerMap(
  record: LocalMapRecord,
  content: MapContent,
  writable: boolean
): ServerMap {
  return {
    uuid: record.uuid,
    ...content,
    createdAt: record.createdAt,
    lastModified: record.lastModified,
    deletedAt: null,
    deleteAfterDays: null,
    writable,
  };
}

function toAdminEntry(record: LocalMapRecord): CachedAdminMapEntry {
  return {
    id: record.uuid,
    cachedAdminMapValue: {
      adminId: record.adminId,
      modificationSecret: record.modificationSecret,
      ttl: null,
      rootName: record.rootName,
    },
  };
}

/**
 * Asks the browser to keep the site's storage under storage pressure. The
 * API exists in secure contexts only, and the map works without it.
 */
function requestPersistentStorage(): void {
  if (!navigator.storage?.persist) return;
  navigator.storage.persist().catch(() => undefined);
}
