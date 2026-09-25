import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Not, In, QueryRunner, Repository } from 'typeorm'
import * as Y from 'yjs'
import { MmpNode } from '../entities/mmpNode.entity'
import { MmpMap } from '../entities/mmpMap.entity'
import { yMapToMmpNode, yMapToMapOptions } from '../utils/yDocConversion'
import { orderNodesFromRoot } from '../utils/nodeOrdering'

interface DebounceEntry {
  doc: Y.Doc
  timer: ReturnType<typeof setTimeout> | null
  // When the oldest change the pending timer covers arrived
  pendingSince: number | null
  observer: () => void
}

@Injectable()
export class YjsPersistenceService implements OnModuleDestroy {
  private readonly logger = new Logger(YjsPersistenceService.name)
  private readonly debounceTimers = new Map<string, DebounceEntry>()
  private readonly DEBOUNCE_MS = 2_000
  // Upper bound on how long continuous editing can postpone a persist
  private readonly MAX_DEBOUNCE_MS = 10_000

  constructor(
    @InjectRepository(MmpNode)
    private readonly nodesRepository: Repository<MmpNode>,
    @InjectRepository(MmpMap)
    private readonly mapsRepository: Repository<MmpMap>
  ) {}

  // YjsDocManagerService persists every loaded doc on shutdown, so this only
  // stops the timers from firing against a closing connection
  onModuleDestroy(): void {
    for (const mapId of Array.from(this.debounceTimers.keys())) {
      this.unregisterDebounce(mapId)
    }
  }

  // Persists a Y.Doc's nodes and options to the database in a transaction
  async persistDoc(mapId: string, doc: Y.Doc): Promise<void> {
    const queryRunner =
      this.nodesRepository.manager.connection.createQueryRunner()
    await queryRunner.connect()

    try {
      await queryRunner.startTransaction()

      const nodesMap = doc.getMap('nodes') as Y.Map<Y.Map<unknown>>
      const optionsMap = doc.getMap('mapOptions') as Y.Map<unknown>
      const now = new Date()

      const mmpNodes = this.extractNodesFromYDoc(nodesMap, mapId, now)

      // Remove nodes that are no longer in the Y.Doc
      await this.deleteRemovedNodes(queryRunner, mapId, mmpNodes)

      // Upsert current nodes (save inserts or updates by PK)
      if (mmpNodes.length > 0) {
        await this.upsertNodes(queryRunner, mmpNodes)
      }

      // Update map options and lastModified
      await this.updateMapMetadata(queryRunner, mapId, optionsMap, now)

      await queryRunner.commitTransaction()
      this.logger.debug(
        `Persisted Y.Doc for map ${mapId} (${mmpNodes.length} nodes)`
      )
    } catch (error) {
      await this.rollbackSafely(queryRunner)
      this.logger.error(
        `Failed to persist Y.Doc for map ${mapId}: ${error instanceof Error ? error.message : String(error)}`
      )
      throw error
    } finally {
      await this.releaseSafely(queryRunner)
    }
  }

  // Registers a Y.Doc update observer that triggers debounced persistence
  registerDebounce(mapId: string, doc: Y.Doc): void {
    this.unregisterDebounce(mapId)

    const observer = (): void => {
      this.resetDebounceTimer(mapId, doc)
    }

    doc.on('update', observer)
    this.debounceTimers.set(mapId, {
      doc,
      timer: null,
      pendingSince: null,
      observer,
    })
  }

  // Removes debounce observer and cancels pending timer
  unregisterDebounce(mapId: string): void {
    const entry = this.debounceTimers.get(mapId)
    if (!entry) return

    entry.doc.off('update', entry.observer)
    if (entry.timer) clearTimeout(entry.timer)
    this.debounceTimers.delete(mapId)
  }

  // Immediately persists, skipping debounce (used on last client disconnect
  // and shutdown). Returns whether the doc reached the database.
  async persistImmediately(mapId: string, doc: Y.Doc): Promise<boolean> {
    this.cancelDebounceTimer(mapId)

    try {
      await this.persistDoc(mapId, doc)
      return true
    } catch (error) {
      this.logger.error(
        `Immediate persist failed for map ${mapId}: ${error instanceof Error ? error.message : String(error)}`
      )
      return false
    }
  }

  // Waits for a pause of DEBOUNCE_MS, but persists at the latest
  // MAX_DEBOUNCE_MS after the first change it covers
  private resetDebounceTimer(mapId: string, doc: Y.Doc): void {
    const entry = this.debounceTimers.get(mapId)
    if (!entry) return

    if (entry.timer) clearTimeout(entry.timer)
    const now = Date.now()
    const pendingSince = entry.pendingSince ?? now
    entry.pendingSince = pendingSince
    const delay = Math.min(
      this.DEBOUNCE_MS,
      pendingSince + this.MAX_DEBOUNCE_MS - now
    )

    entry.timer = setTimeout(
      async () => {
        entry.timer = null
        entry.pendingSince = null
        try {
          await this.persistDoc(mapId, doc)
        } catch (error) {
          this.logger.error(
            `Debounced persist failed for map ${mapId}: ${error instanceof Error ? error.message : String(error)}`
          )
          // Do not crash — retry on next debounce cycle
        }
      },
      Math.max(0, delay)
    )
  }

  private cancelDebounceTimer(mapId: string): void {
    const entry = this.debounceTimers.get(mapId)
    if (!entry) return
    if (entry.timer) clearTimeout(entry.timer)
    entry.timer = null
    entry.pendingSince = null
  }

  // Extracts nodes from Y.Doc, ensuring root is first with stable orderNumbers.
  // Throws when no root reaches any node, because deleteRemovedNodes would
  // otherwise delete every node row of the map.
  private extractNodesFromYDoc(
    nodesMap: Y.Map<Y.Map<unknown>>,
    mapId: string,
    now: Date
  ): Partial<MmpNode>[] {
    const nodes: Partial<MmpNode>[] = []
    nodesMap.forEach((yNode) => {
      nodes.push({ ...yMapToMmpNode(yNode, mapId), lastModified: now })
    })
    const ordered = orderNodesFromRoot(nodes)
    if (nodes.length > 0 && ordered.length === 0) {
      throw new Error(`No root reaches any of the ${nodes.length} nodes`)
    }
    return ordered
  }

  private async deleteRemovedNodes(
    queryRunner: QueryRunner,
    mapId: string,
    currentNodes: Partial<MmpNode>[]
  ): Promise<void> {
    const keepIds = currentNodes
      .map((n) => n.id)
      .filter((id): id is string => !!id)

    if (keepIds.length === 0) {
      await queryRunner.manager.delete(MmpNode, { nodeMapId: mapId })
      return
    }

    await queryRunner.manager.delete(MmpNode, {
      nodeMapId: mapId,
      id: Not(In(keepIds)),
    })
  }

  // One INSERT ... ON CONFLICT DO UPDATE for all nodes. `save()` would issue
  // one UPDATE per existing node in parallel on the same connection, which pg
  // deprecates (queries on a client must not overlap). Entity instances keep
  // the @BeforeInsert validation running.
  private async upsertNodes(
    queryRunner: QueryRunner,
    nodes: Partial<MmpNode>[]
  ): Promise<void> {
    const entities = nodes.map((node) =>
      queryRunner.manager.create(MmpNode, node)
    )
    await queryRunner.manager.upsert(MmpNode, entities, ['id', 'nodeMapId'])
  }

  private async updateMapMetadata(
    queryRunner: QueryRunner,
    mapId: string,
    optionsMap: Y.Map<unknown>,
    now: Date
  ): Promise<void> {
    const { name, options } = yMapToMapOptions(optionsMap)
    await queryRunner.manager.update(MmpMap, mapId, {
      name,
      options,
      lastModified: now,
    })
  }

  private async rollbackSafely(queryRunner: QueryRunner): Promise<void> {
    try {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction()
      }
    } catch (error) {
      this.logger.error(
        `Rollback failed: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  private async releaseSafely(queryRunner: QueryRunner): Promise<void> {
    try {
      if (!queryRunner.isReleased) {
        await queryRunner.release()
      }
    } catch (error) {
      this.logger.error(
        `Release failed: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }
}
