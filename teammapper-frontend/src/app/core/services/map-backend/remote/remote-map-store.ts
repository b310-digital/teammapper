import { Injectable, inject } from '@angular/core';
import {
  CachedAdminMapEntry,
  ImageReference,
  imageIdOf,
  MODIFICATION_SECRET_HEADER,
  parseImageUploadResponse,
  UserMapOptions,
} from '@teammapper/shared';
import { API_URL, HttpService } from '../../../http/http.service';
import { ImageUploadError } from '../../mmp/node-images';
import {
  PrivateServerMap,
  ServerMap,
  ServerMapInfo,
} from '../../map-sync/server-types';
import { MapStore } from '../map-store';

/** Keeps the maps and their node images on the TeamMapper backend. */
@Injectable()
export class RemoteMapStore implements MapStore {
  private httpService = inject(HttpService);

  async createMap(
    rootNode: UserMapOptions['rootNode']
  ): Promise<PrivateServerMap> {
    const response = await this.httpService.post(
      API_URL.ROOT,
      '/maps/',
      JSON.stringify({ rootNode })
    );
    return response.json();
  }

  async getMap(
    uuid: string,
    modificationSecret: string
  ): Promise<ServerMap | null> {
    const response = await this.httpService.get(
      API_URL.ROOT,
      '/maps/' + uuid,
      secretHeaders(modificationSecret)
    );
    if (!response.ok) return null;
    return response.json();
  }

  async listMaps(): Promise<CachedAdminMapEntry[]> {
    const response = await this.httpService.get(API_URL.ROOT, '/maps');
    if (!response.ok) return [];
    const json: ServerMapInfo[] = await response.json();
    return json.map(map => ({
      id: map.uuid,
      cachedAdminMapValue: {
        adminId: map.adminId,
        modificationSecret: map.modificationSecret,
        ttl: map.ttl ? new Date(map.ttl) : null,
        rootName: map.rootName,
      },
    }));
  }

  // The server answers 200 to a wrong admin id as well, so true does not
  // prove the map is gone.
  async deleteMap(uuid: string, adminId: string): Promise<boolean> {
    try {
      const response = await this.httpService.delete(
        API_URL.ROOT,
        `/maps/${encodeURIComponent(uuid)}`,
        JSON.stringify({ adminId })
      );
      return response.ok;
    } catch {
      return false;
    }
  }

  /** Posts the image to the map, with the secret in its header. */
  async uploadImage(
    mapId: string,
    image: Blob,
    modificationSecret: string
  ): Promise<ImageReference> {
    const form = new FormData();
    form.append('file', image, 'image');
    const response = await this.httpService
      .postForm(
        API_URL.ROOT,
        `/maps/${mapId}/images`,
        form,
        secretHeaders(modificationSecret)
      )
      .catch(() => null);
    if (!response?.ok) throw new ImageUploadError(response?.status ?? 0);
    return referenceFromUploadResponse(response);
  }

  /** The image endpoint of the map for a reference. */
  imageUrl(mapId: string, reference: ImageReference): string {
    return `${API_URL.ROOT}/maps/${mapId}/images/${imageIdOf(reference)}`;
  }

  /** The browser loads each image from its endpoint when mmp draws it. */
  async preloadImages(_mapId: string): Promise<void> {
    return;
  }

  /** Holds nothing to free. */
  releaseImages(): void {
    return;
  }
}

/** Headers that carry the modification secret, if the map has one. */
function secretHeaders(modificationSecret: string): Record<string, string> {
  return modificationSecret
    ? { [MODIFICATION_SECRET_HEADER]: modificationSecret }
    : {};
}

async function referenceFromUploadResponse(
  response: Response
): Promise<ImageReference> {
  const body: unknown = await response.json().catch(() => null);
  const reference = parseImageUploadResponse(body);
  if (!reference) throw new ImageUploadError(response.status);
  return reference;
}
