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
  /** null when the map does not exist or cannot be read */
  getMap(uuid: string, modificationSecret: string): Promise<ServerMap | null>;
  /** The maps the current user created, empty on an error status. */
  listMaps(): Promise<CachedAdminMapEntry[]>;
  /** false on an error or an unknown map */
  deleteMap(uuid: string, adminId: string): Promise<boolean>;
  /** throws ImageUploadError */
  uploadImage(
    mapId: string,
    image: Blob,
    modificationSecret: string
  ): Promise<ImageReference>;
  imageUrl(mapId: string, reference: ImageReference): string | null;
}

export const MAP_STORE = new InjectionToken<MapStore>('MAP_STORE');
