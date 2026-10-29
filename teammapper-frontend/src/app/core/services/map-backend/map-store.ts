import { InjectionToken } from '@angular/core';
import {
  CachedAdminMapEntry,
  ImageReference,
  UserMapOptions,
} from '@teammapper/shared';
import { PrivateServerMap, ServerMap } from '../map-sync/server-types';

/**
 * Keeps the maps and their node images: creates, loads, lists and deletes
 * maps, stores node images and resolves an image reference to an address.
 * The content of an open map travels over a `MapConnection` instead.
 */
export interface MapStore {
  createMap(rootNode: UserMapOptions['rootNode']): Promise<PrivateServerMap>;
  /**
   * null when the map does not exist or cannot be read. Rejects with a
   * `ReportedMapStoreError` when the store refuses access.
   */
  getMap(uuid: string, modificationSecret: string): Promise<ServerMap | null>;
  /** The maps the current user created, empty on an error status. */
  listMaps(): Promise<CachedAdminMapEntry[]>;
  /** false on an error or an unknown map */
  deleteMap(uuid: string, adminId: string): Promise<boolean>;
  /** throws ImageUploadError, or ReportedMapStoreError */
  uploadImage(
    mapId: string,
    image: Blob,
    modificationSecret: string
  ): Promise<ImageReference>;
  imageUrl(mapId: string, reference: ImageReference): string | null;
  /**
   * Makes `imageUrl` resolve the images of the map before it opens. Resolves
   * at once in the remote store.
   */
  preloadImages(mapId: string): Promise<void>;
  /** Frees what `preloadImages` holds, once the map closes. */
  releaseImages(): void;
}

export const MAP_STORE = new InjectionToken<MapStore>('MAP_STORE');

/**
 * A store failure that the store has already shown the visitor a toast for.
 * A caller that catches it shows no toast of its own.
 */
export class ReportedMapStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReportedMapStoreError';
  }
}
