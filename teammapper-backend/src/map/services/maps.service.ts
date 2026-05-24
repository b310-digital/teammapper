import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, QueryRunner, In } from 'typeorm'
import { MmpMap } from '../entities/mmpMap.entity'
import { MmpNode } from '../entities/mmpNode.entity'
import {
  IMmpClientMap,
  IMmpClientNodeBasics,
  IMmpClientMapInfo,
} from '../types'
import {
  mapClientBasicNodeToMmpRootNode,
  mapClientNodeToMmpNode,
  mapMmpMapToClient,
} from '../utils/clientServerMapping'
import configService from '../../config.service'
import { validate as uuidValidate } from 'uuid'
import MalformedUUIDError from './uuid.error'

@Injectable()
export class MapsService {
  private readonly logger = new Logger(MapsService.name)

  constructor(
    @InjectRepository(MmpNode)
    private nodesRepository: Repository<MmpNode>,
    @InjectRepository(MmpMap)
    private mapsRepository: Repository<MmpMap>
  ) {}

  private async findRootNode(mapId: string): Promise<MmpNode | null> {
    return await this.nodesRepository.findOne({
      where: { nodeMapId: mapId, root: true },
    })
  }

  async getMapsOfUser(userId: string): Promise<IMmpClientMapInfo[]> {
    if (!userId) return []
    const mapsOfUser = await this.mapsRepository.find({
      where: { ownerExternalId: userId },
    })

    const mapsInfo: IMmpClientMapInfo[] = await Promise.all(
      mapsOfUser.map(async (map: MmpMap) => {
        return {
          uuid: map.id,
          adminId: map.adminId,
          modificationSecret: map.modificationSecret,
          ttl: await this.getDeletedAt(map, configService.deleteAfterDays()),
          rootName: (await this.findRootNode(map.id))?.name || null,
        }
      })
    )

    mapsInfo.sort((a, b) => (b.ttl?.getTime() ?? 0) - (a.ttl?.getTime() ?? 0))

    return mapsInfo.slice(0, 20)
  }

  findMap(uuid: string): Promise<MmpMap | null> {
    if (!uuidValidate(uuid))
      return Promise.reject(new MalformedUUIDError('Invalid UUID'))

    return this.mapsRepository.findOne({
      where: { id: uuid },
    })
  }

  async updateLastAccessed(uuid: string, lastAccessed = new Date()) {
    const map = await this.findMap(uuid)
    if (!map) {
      this.logger.warn(`updateLastAccessed(): Map was not found`)
      return
    }

    await this.mapsRepository.update(uuid, { lastAccessed })
  }

  async exportMapToClient(uuid: string): Promise<IMmpClientMap | undefined> {
    const map = await this.findMap(uuid)
    if (!map) {
      this.logger.warn(`exportMapToClient(): Map was not found`)
      return
    }

    const nodes = await this.findNodes(map?.id)
    const days = configService.deleteAfterDays()
    const deletedAt = await this.getDeletedAt(map, days)

    if (deletedAt) {
      return mapMmpMapToClient(map, nodes, deletedAt, days)
    }
  }

  /**
   * Bulk-inserts nodes into a map within a single transaction. Used by the
   * REST duplicate-map endpoint, where the source nodes are already valid
   * MmpNode entities. Yjs persistence has its own path that does not rely on
   * this method.
   */
  async addNodes(mapId: string, nodes: Partial<MmpNode>[]): Promise<MmpNode[]> {
    if (!mapId || nodes.length === 0) {
      this.logger.warn(
        `Required arguments mapId or nodes not supplied to addNodes()`
      )
      return []
    }

    const queryRunner = await this.createQueryRunner()

    try {
      await queryRunner.startTransaction()

      const nodesToCreate = await this.filterOutExistingNodes(
        queryRunner,
        mapId,
        nodes as MmpNode[]
      )

      const createdNodes = await this.saveAllNodesInTransaction(
        queryRunner,
        mapId,
        nodesToCreate
      )

      await queryRunner.commitTransaction()
      return createdNodes
    } catch (error) {
      await this.rollbackTransactionSafely(queryRunner)
      this.logger.error(
        `addNodes(): Failed to add nodes to map ${mapId}: ${error instanceof Error ? error.message : String(error)}`
      )
      throw error
    } finally {
      await this.releaseQueryRunnerSafely(queryRunner)
    }
  }

  private async rollbackTransactionSafely(
    queryRunner: QueryRunner
  ): Promise<void> {
    try {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction()
      }
    } catch (rollbackError) {
      this.logger.error(
        `Failed to rollback transaction: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`
      )
    }
  }

  private async releaseQueryRunnerSafely(
    queryRunner: QueryRunner
  ): Promise<void> {
    try {
      if (!queryRunner.isReleased) {
        await queryRunner.release()
      }
    } catch (releaseError) {
      this.logger.error(
        `Failed to release query runner: ${releaseError instanceof Error ? releaseError.message : String(releaseError)}`
      )
    }
  }

  private async filterOutExistingNodes(
    queryRunner: QueryRunner,
    mapId: string,
    nodes: MmpNode[]
  ): Promise<MmpNode[]> {
    if (nodes.length === 0) return []

    const nodeIds = nodes.map((n) => n.id)
    const existingNodes = await queryRunner.manager.find(MmpNode, {
      where: {
        id: In(nodeIds),
        nodeMapId: mapId,
      },
      select: ['id'],
    })

    const existingNodeIds = new Set(existingNodes.map((n) => n.id))
    return nodes.filter((node) => !existingNodeIds.has(node.id))
  }

  private async saveAllNodesInTransaction(
    queryRunner: QueryRunner,
    mapId: string,
    nodes: MmpNode[]
  ): Promise<MmpNode[]> {
    if (nodes.length === 0) return []

    const newNodes = nodes.map((node) =>
      queryRunner.manager.create(MmpNode, {
        ...node,
        nodeMapId: mapId,
      })
    )

    return await queryRunner.manager.save(newNodes)
  }

  async findNodes(mapId: string): Promise<MmpNode[]> {
    return this.nodesRepository
      .createQueryBuilder('mmpNode')
      .where('mmpNode.nodeMapId = :mapId', { mapId })
      .orderBy('mmpNode.orderNumber', 'ASC')
      .getMany()
  }

  private async createRootNodeForMap(
    rootNode: IMmpClientNodeBasics,
    mapId: string
  ): Promise<void> {
    const newRootNode = this.nodesRepository.create(
      mapClientBasicNodeToMmpRootNode(rootNode, mapId)
    )

    try {
      await this.nodesRepository.save(newRootNode)
    } catch (error) {
      this.logger.error(
        `${error instanceof Error ? error.constructor.name : 'Unknown'} createEmptyMap(): Failed to create root node ${newRootNode.id}: ${error instanceof Error ? error.message : String(error)}`
      )
      throw error
    }
  }

  async createEmptyMap(
    rootNode?: IMmpClientNodeBasics,
    userId?: string
  ): Promise<MmpMap> {
    const newMap: MmpMap = this.mapsRepository.create({
      ownerExternalId: userId,
    })
    const savedNewMap: MmpMap = await this.mapsRepository.save(newMap)

    if (rootNode) {
      await this.createRootNodeForMap(rootNode, savedNewMap.id)
    }

    return savedNewMap
  }

  /**
   * Replaces all nodes in a map atomically. Used by REST import flows.
   */
  async updateMap(clientMap: IMmpClientMap): Promise<MmpMap | null> {
    const queryRunner = await this.createQueryRunner()

    try {
      await queryRunner.startTransaction()
      await queryRunner.manager.delete(MmpNode, { nodeMapId: clientMap.uuid })
      await this.saveValidNodes(queryRunner, clientMap)
      await queryRunner.commitTransaction()
      return this.findMap(clientMap.uuid)
    } catch (error) {
      await this.rollbackTransactionSafely(queryRunner)
      this.logger.error(
        `updateMap(): Failed to update map ${clientMap.uuid}: ${error instanceof Error ? error.message : String(error)}`
      )
      throw error
    } finally {
      await this.releaseQueryRunnerSafely(queryRunner)
    }
  }

  private async createQueryRunner() {
    const queryRunner =
      this.nodesRepository.manager.connection.createQueryRunner()
    await queryRunner.connect()
    return queryRunner
  }

  private async saveValidNodes(
    queryRunner: QueryRunner,
    clientMap: IMmpClientMap
  ): Promise<void> {
    const mmpNodes = clientMap.data.map((x) =>
      mapClientNodeToMmpNode(x, clientMap.uuid)
    )
    for (const node of mmpNodes) {
      const newNode = queryRunner.manager.create(MmpNode, {
        ...(node as MmpNode),
        nodeMapId: clientMap.uuid,
      })
      await queryRunner.manager.save(newNode)
    }
  }

  async getDeletedAt(
    map: MmpMap,
    afterDays: number
  ): Promise<Date | undefined> {
    if (!map) {
      this.logger.warn(
        `Required argument map was not supplied to getDeletedAt()`
      )
      return
    }

    const newestNodeQuery = this.nodesRepository
      .createQueryBuilder('node')
      .select('max(node.lastModified) AS lastModified')
      .where({ nodeMapId: map.id })
    const newestNode = newestNodeQuery.getRawOne()
    const newestNodeLastModified = (await newestNode)['lastmodified']
    const lastModified =
      newestNodeLastModified === null
        ? map.lastModified
        : newestNodeLastModified

    const lastAccessed = map.lastAccessed

    return this.calculcateDeletedAt(
      lastAccessed ? new Date(lastAccessed) : new Date(lastModified),
      afterDays
    )
  }

  calculcateDeletedAt(lastModified: Date, afterDays: number): Date {
    const copyDate: Date = new Date(lastModified.getTime())
    copyDate.setDate(copyDate.getDate() + afterDays)
    return copyDate
  }

  async deleteOutdatedMaps(
    afterDays: number = 30
  ): Promise<number | null | undefined> {
    const today = new Date()

    const deleteQuery = this.mapsRepository
      .createQueryBuilder('map')
      .select('map.id')
      .leftJoin(
        (qb) =>
          qb
            .select([
              'node.nodeMapId AS nodeMapId',
              'max(node.lastModified) AS lastUpdatedAt',
            ])
            .from(MmpNode, 'node')
            .groupBy('node.nodeMapId'),
        'lastmodifiednode',
        'lastmodifiednode.nodeMapid = map.id'
      )
      .where(
        "(GREATEST(map.lastAccessed, map.lastModified, lastmodifiednode.lastUpdatedAt) + (INTERVAL '1 day' * :afterDays)) < :today",
        { afterDays, today }
      )

    const outdatedMapsIdsFlat = (await deleteQuery.getRawMany()).flatMap(
      (id) => id['map_id']
    )

    if (outdatedMapsIdsFlat.length > 0) {
      return (
        await this.mapsRepository
          .createQueryBuilder()
          .where('id IN (:...ids)', { ids: outdatedMapsIdsFlat })
          .delete()
          .execute()
      ).affected
    }

    return 0
  }

  async deleteMap(uuid: string): Promise<void> {
    await this.mapsRepository.delete({ id: uuid })
  }
}
