import { MapSnapshot } from '@mmp/map/types';
import { MapOptions } from '@teammapper/shared';

export interface CachedMapEntry {
  cachedMap: CachedMap;
  key: string;
}

export interface CachedMap {
  lastModified: number;
  createdAt: number;
  data: MapSnapshot;
  uuid: string;
  deleteAfterDays: number;
  deletedAt: number;
  options: CachedMapOptions;
}

export type CachedMapOptions = Required<MapOptions>;

export interface CachedAdminMapValue {
  adminId: string;
  modificationSecret: string;
  ttl: Date;
  rootName: string | null;
}

export interface CachedAdminMapEntry {
  id: string;
  cachedAdminMapValue: CachedAdminMapValue;
}
