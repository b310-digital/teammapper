export interface CachedMapEntry {
  cachedMap: CachedMap;
  key: string;
}

export interface CachedMap {
  lastModified: number;
  data: any;
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
