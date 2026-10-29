import {
  CachedMapOptions,
  ClientMap,
  ClientMapInfo,
  ClientPrivateMap,
  MapSnapshot,
} from '@teammapper/shared';

interface ServerMap extends Omit<
  ClientMap,
  'data' | 'options' | 'createdAt' | 'lastModified' | 'deletedAt'
> {
  deleteAfterDays: number | null;
  data: MapSnapshot;
  options: CachedMapOptions;
  createdAt: string;
  lastModified: string;
  deletedAt: string | null;
}

interface PrivateServerMap extends Omit<ClientPrivateMap, 'map'> {
  map: ServerMap;
  adminId: string;
  modificationSecret: string;
}

interface ServerMapInfo extends Omit<ClientMapInfo, 'ttl'> {
  ttl: string | null;
}

export { ServerMap, ServerMapInfo, PrivateServerMap };
