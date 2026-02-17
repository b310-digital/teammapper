import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common'
import * as Y from 'yjs'
import { MapsService } from './maps.service'
import { YjsPersistenceService } from './yjs-persistence.service'
import { hydrateYDoc } from '../utils/yDocConversion'

interface DocEntry {
  doc: Y.Doc
  graceTimer: ReturnType<typeof setTimeout> | null
}

@Injectable()
export class YjsDocManagerService implements OnModuleDestroy {
  private readonly logger = new Logger(YjsDocManagerService.name)
  private readonly docs = new Map<string, DocEntry>()
  private readonly hydrating = new Map<string, Promise<Y.Doc>>()
  private readonly GRACE_PERIOD_MS = 30_000

  constructor(
    private readonly mapsService: MapsService,
    private readonly persistenceService: YjsPersistenceService
  ) {}

  onModuleDestroy(): void {
    for (const [mapId] of this.docs) {
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
    const entry = this.docs.get(mapId)
    if (!entry) return

    this.logger.debug(`Map ${mapId} client count: ${count}`)

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
    await this.persistSafely(mapId, entry.doc)
    this.startGraceTimer(mapId, entry)
  }

  private startGraceTimer(mapId: string, entry: DocEntry): void {
    this.cancelGraceTimer(entry)
    entry.graceTimer = setTimeout(() => {
      this.evictDoc(mapId)
    }, this.GRACE_PERIOD_MS)
  }

  private cancelGraceTimer(entry: DocEntry): void {
    if (entry.graceTimer) {
      clearTimeout(entry.graceTimer)
      entry.graceTimer = null
    }
  }

  private evictDoc(mapId: string): void {
    const entry = this.docs.get(mapId)
    if (!entry) return

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

  private async persistSafely(mapId: string, doc: Y.Doc): Promise<void> {
    await this.persistenceService.persistImmediately(mapId, doc)
  }
}
