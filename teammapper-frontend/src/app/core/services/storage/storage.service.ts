import { Injectable } from '@angular/core'
import * as localforage from 'localforage'
import { CachedAdminMapValue } from 'src/app/shared/models/cached-map.model'

/**
 * Enumerative of the possible keys present in the storage
 */
export enum STORAGE_KEYS {
  SETTINGS = 'settings'
}

@Injectable({
  providedIn: 'root'
})
export class StorageService {
  /**
     * Initialize the storage service setting the default storage.
     */
  constructor (
  ) {}

  /**
     * Return the value or the values based on the keys passed as parameters.
     */
  public async get (keys: string | string[]): Promise<any | any[] | null> {
    if (typeof keys === 'string') {
      return localforage.getItem(keys)
    }

    const items: any[] = []

    for (const key of keys) {
      if (keys.includes(key)) {
        items.push(await this.get(key))
      }
    }

    return items && items.length > 0 ? items : null
  }

  /**
     * Return all the saved values in the storage.
     */
  public async getAll (): Promise<any[] | null> {
    const keys = await localforage.keys()
    const values = await Promise.all(keys.map(async (key: string) => {
      return new Promise((resolve, _reject) => {
        this.get(key).then((value: any) => {
          resolve(value)
        })
      })
    }))

    return values || null
  }

  /**
     * Return all the saved keys in the storage.
     */
  public async getAllEntries (): Promise<any[] | null> {
    const keys = await localforage.keys()
    const entries = await Promise.all(keys.map(async (key: string) => {
      return new Promise((resolve, _reject) => {
        this.get(key).then((value: any) => {
          resolve([key, value])
        })
      })
    }))

    return entries || null
  }

  /**
     * Return all maps from storage.
     */
  public async getAllCreatedMapsFromStorage (): Promise<[string, CachedAdminMapValue][]> {
    return (await this.getAllEntries()).filter(([key, _value]) => key !== 'settings') as [string, CachedAdminMapValue][]
  }

  /**
     * Save an item in the storage.
     */
  public async set (key: string, item: any): Promise<void> {
    localforage.setItem(key, item)
  }

  /**
     * Remove an item from the storage.
     */
  public async remove (key: string): Promise<void> {
    localforage.removeItem(key)
  }

  /**
     * Check if an item exist in the storage. Return true if it exist, false otherwise.
     */
  public async exist (key: string): Promise<boolean> {
    return !!this.get(key)
  }

  /**
     * Remove all the items from the storage.
     */
  public async clear (): Promise<void> {
    localforage.clear()
  }

  /**
     * Check if there are items in the storage. Return true if there are items, false otherwise.
     */
  public async isEmpty (): Promise<boolean> {
    const items: any[] = await this.getAll()

    return items && items.length > 0
  }

  /*
    * Cleans all outdated entries that support a ttl
    */
  public async cleanExpired (): Promise<void> {
    const today = new Date()
    const time: number = today.getTime()
    const entries = await this.getAllEntries()
    entries.forEach(([key, value]: [any, any]) => {
      if (!value?.ttl) return

      if (time > value?.ttl) this.remove(key)
    })
  }
}
