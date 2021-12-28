export interface CachedMapEntry {
    cachedMap: CachedMap,
    key: string
}

export interface CachedMap {
    lastModified: number
    data: any
    uuid: string
    deleteAfterDays: number
    deletedAt: Date
}
