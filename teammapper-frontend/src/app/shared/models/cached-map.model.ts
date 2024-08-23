import { MapSnapshot } from '@mmp/map/types';

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

export interface CachedMapOptions {
  fontMaxSize: number;
  fontMinSize: number;
  fontIncrement: number;
}

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
