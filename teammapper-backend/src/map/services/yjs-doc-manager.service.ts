import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common'
import * as Y from 'yjs'
import { MapsService } from './maps.service'
import { YjsPersistenceService } from './yjs-persistence.service'
import { hydrateYDoc } from '../utils/yDocConversion'

interface DocEntry {
  doc: Y.Doc
  graceTimer: ReturnType<typeof setTimeout> | null
  // Connections the gateway last reported for the map
  clients: number
  // Whether the doc holds changes the last persist failed to save
  unsaved: boolean
  // Persists that failed in a row since the last client left
  failedPersists: number
}

@Injectable()
export class YjsDocManagerService implements OnModuleDestroy {
  private readonly logger = new Logger(YjsDocManagerService.name)
  private readonly docs = new Map<string, DocEntry>()
  private readonly hydrating = new Map<string, Promise<Y.Doc>>()
  private readonly GRACE_PERIOD_MS = 30_000
  private readonly FLUSH_TIMEOUT_MS = 5_000
  // Failed persists after which an unsaved doc is evicted anyway, so a map
  // that can never be saved does not hold memory until restart
  private readonly MAX_FAILED_PERSISTS = 5
  private shuttingDown = false

  constructor(
    private readonly mapsService: MapsService,
    private readonly persistenceService: YjsPersistenceService
  ) {}

  // Persists every loaded doc before dropping it, so a shutdown keeps the
  // edits the debounce has not saved yet. The flush gives up after
  // FLUSH_TIMEOUT_MS, and an edit that arrives during the flush is lost.
  async onModuleDestroy(): Promise<void> {
    this.shuttingDown = true
    const entries = Array.from(this.docs)
    for (const [, entry] of entries) this.cancelGraceTimer(entry)

    if (entries.length > 0) {
      this.logger.log(`Flushing ${entries.length} docs on shutdown`)
      await this.flushWithTimeout(entries)
    }

    for (const [mapId] of entries) {
      this.forceDestroyDoc(mapId)
    }
  }

  getDoc(mapId: string): Y.Doc | undefined {
    return this.docs.get(mapId)?.doc
  }

  async getOrCreateDoc(mapId: string): Promise<Y.Doc> {
    const existing = this.docs.get(mapId)
    if (existing) {
      this.cancelGraceTimer(existing)
      return existing.doc
    }

    // Deduplicate concurrent hydrations for the same mapId
    const inflight = this.hydrating.get(mapId)
    if (inflight) return inflight

    const promise = this.hydrateDocFromDb(mapId)
    this.hydrating.set(mapId, promise)
    try {
      return await promise
    } finally {
      this.hydrating.delete(mapId)
    }
  }

  async notifyClientCount(mapId: string, count: number): Promise<void> {
    if (this.shuttingDown) return
    const entry = this.docs.get(mapId)
    if (!entry) return

    this.logger.debug(`Map ${mapId} client count: ${count}`)
    entry.clients = count

    if (count > 0) {
      this.cancelGraceTimer(entry)
      return
    }

    await this.onLastClientDisconnect(mapId, entry)
  }

  destroyDoc(mapId: string): void {
    this.forceDestroyDoc(mapId)
  }

  // Restores the grace timer if no clients are connected (used on setup failure)
  restoreGraceTimer(mapId: string, connectionCount: number): void {
    if (connectionCount > 0) return

    const entry = this.docs.get(mapId)
    if (!entry) return

    entry.clients = connectionCount
    this.startGraceTimer(mapId, entry)
  }

  hasDoc(mapId: string): boolean {
    return this.docs.has(mapId)
  }

  private async hydrateDocFromDb(mapId: string): Promise<Y.Doc> {
    const [map, nodes] = await Promise.all([
      this.mapsService.findMap(mapId),
      this.mapsService.findNodes(mapId),
    ])

    if (!map) {
      throw new Error(`Map ${mapId} not found`)
    }

    const doc = new Y.Doc()
    hydrateYDoc(doc, nodes, map)

    this.docs.set(mapId, {
      doc,
      graceTimer: null,
      clients: 0,
      unsaved: false,
      failedPersists: 0,
    })

    this.logger.log(
      `Hydrated Y.Doc for map ${mapId} with ${nodes.length} nodes`
    )
    return doc
  }

  private async onLastClientDisconnect(
    mapId: string,
    entry: DocEntry
  ): Promise<void> {
    await this.persistEntry(mapId, entry)
    // A client may have connected while the persist ran
    if (this.isIdle(mapId, entry)) this.startGraceTimer(mapId, entry)
  }

  private startGraceTimer(mapId: string, entry: DocEntry): void {
    this.cancelGraceTimer(entry)
    entry.graceTimer = setTimeout(() => {
      entry.graceTimer = null
      this.evictDoc(mapId, entry)
    }, this.GRACE_PERIOD_MS)
  }

  private cancelGraceTimer(entry: DocEntry): void {
    if (entry.graceTimer) {
      clearTimeout(entry.graceTimer)
      entry.graceTimer = null
    }
  }

  private async persistEntry(mapId: string, entry: DocEntry): Promise<void> {
    const saved = await this.persistenceService.persistImmediately(
      mapId,
      entry.doc
    )
    entry.unsaved = !saved
    entry.failedPersists = saved ? 0 : entry.failedPersists + 1
  }

  // Whether the entry is still loaded and no client uses it
  private isIdle(mapId: string, entry: DocEntry): boolean {
    return this.docs.get(mapId) === entry && entry.clients === 0
  }

  // Drops an idle doc. A doc the last persist failed to save holds the only
  // copy of those changes, so the manager retries the persist and waits
  // another grace period, up to MAX_FAILED_PERSISTS failures.
  private evictDoc(mapId: string, entry: DocEntry): void {
    if (!this.isIdle(mapId, entry)) return

    if (entry.unsaved && entry.failedPersists < this.MAX_FAILED_PERSISTS) {
      this.logger.warn(`Retrying persist of unsaved Y.Doc for map ${mapId}`)
      // persistImmediately reports failures instead of throwing
      void this.onLastClientDisconnect(mapId, entry)
      return
    }
    if (entry.unsaved) {
      this.logger.error(
        `Evicting Y.Doc for map ${mapId} after ${entry.failedPersists} failed persists; its unsaved changes are lost`
      )
    }

    entry.doc.destroy()
    this.docs.delete(mapId)
    this.logger.log(`Evicted Y.Doc for map ${mapId}`)
  }

  private forceDestroyDoc(mapId: string): void {
    const entry = this.docs.get(mapId)
    if (!entry) return

    this.cancelGraceTimer(entry)
    entry.doc.destroy()
    this.docs.delete(mapId)
    this.logger.log(`Force-destroyed Y.Doc for map ${mapId}`)
  }

  private async flushWithTimeout(
    entries: Array<[string, DocEntry]>
  ): Promise<void> {
    // persistImmediately reports failures instead of throwing
    const flushPromise = Promise.all(
      entries.map(([mapId, entry]) =>
        this.persistenceService.persistImmediately(mapId, entry.doc)
      )
    )

    let timeoutId: ReturnType<typeof setTimeout> | null = null
    const timeoutPromise = new Promise<void>((resolve) => {
      timeoutId = setTimeout(resolve, this.FLUSH_TIMEOUT_MS)
    })

    await Promise.race([flushPromise, timeoutPromise])
    if (timeoutId) clearTimeout(timeoutId)
  }
}
