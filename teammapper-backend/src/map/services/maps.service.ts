import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { MmpMap } from '../entities/mmpMap.entity'
import { MmpNode } from '../entities/mmpNode.entity'
import {
  IMmpClientMap,
  IMmpClientMapOptions,
  IMmpClientNode,
  IMmpClientNodeBasics,
  IMmpClientMapDiff,
  IMmpClientSnapshotChanges,
} from '../types'
import {
  mapClientBasicNodeToMmpRootNode,
  mapClientNodeToMmpNode,
  mapMmpMapToClient,
  mergeClientNodeIntoMmpNode,
} from '../utils/clientServerMapping'
import {
  shouldValidateParent,
  createParentNotFoundWarning,
} from '../utils/nodeValidation'
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

    this.mapsRepository.update(uuid, { lastAccessed })
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

  private validateNodeParentConstraints(node: MmpNode): boolean {
    if (node.detached && node.nodeParentId) {
      this.logger.warn(
        `addNode(): Detached node ${node.id} is not allowed to have a parent.`
      )
      return false
    }

    if (node.root && node.nodeParentId) {
      this.logger.warn(
        `addNode(): Root node ${node.id} is not allowed to have a parent.`
      )
      return false
    }

    return true
  }

  async addNode(mapId: string, node: MmpNode): Promise<MmpNode | undefined> {
    if (!mapId || !node) {
      this.logger.warn(
        `addNode(): Required arguments mapId or node not supplied`
      )
      return
    }

    if (!this.validateNodeParentConstraints(node)) return

    const existingNode = await this.nodesRepository.findOne({
      where: { id: node.id, nodeMapId: mapId },
    })
    if (existingNode) return existingNode

    const newNode = this.nodesRepository.create({
      ...node,
      nodeMapId: mapId,
    })

    try {
      return await this.nodesRepository.save(newNode)
    } catch (error) {
      this.logger.error(
        `${error instanceof Error ? error.constructor.name : 'Unknown'} addNode(): Failed to add node ${newNode.id}: ${error instanceof Error ? error.message : String(error)}`
      )
      return Promise.reject(error)
    }
  }

  async addNodesFromClient(
    mapId: string,
    clientNodes: IMmpClientNode[]
  ): Promise<MmpNode[] | []> {
    const mmpNodes = clientNodes.map((x) => mapClientNodeToMmpNode(x, mapId))
    return await this.addNodes(mapId, mmpNodes)
  }

  async addNodes(
    mapId: string,
    nodes: Partial<MmpNode>[]
  ): Promise<MmpNode[] | []> {
    if (!mapId || nodes.length === 0) {
      this.logger.warn(
        `Required arguments mapId or nodes not supplied to addNodes()`
      )
      return []
    }

    const reducer = async (
      previousPromise: Promise<MmpNode[]>,
      node: MmpNode
    ): Promise<MmpNode[]> => {
      const accCreatedNodes = await previousPromise
      if (await this.validatesNodeParentForNode(mapId, node)) {
        try {
          const newNode = await this.addNode(mapId, node)
          if (newNode) {
            return accCreatedNodes.concat([newNode])
          }
        } catch (error) {
          this.logger.warn(
            `Failed to add node ${node.id} to map ${mapId}: ${error}`
          )
        }

        return accCreatedNodes
      }

      this.logger.warn(
        `Parent with id ${node.nodeParentId} does not exist for node ${node.id} and map ${mapId}`
      )
      return accCreatedNodes
    }

    return nodes.reduce(reducer, Promise.resolve(new Array<MmpNode>()))
  }

  async findNodes(mapId: string): Promise<MmpNode[]> {
    return this.nodesRepository
      .createQueryBuilder('mmpNode')
      .where('mmpNode.nodeMapId = :mapId', { mapId })
      .orderBy('mmpNode.orderNumber', 'ASC')
      .getMany()
  }

  async existsNode(mapId: string, parentId: string): Promise<boolean> {
    if (!mapId || !parentId) return false

    return await this.nodesRepository.exist({
      where: { id: parentId, nodeMapId: mapId },
    })
  }

  private async validateNodeParentExists(
    mapId: string,
    nodeId: string,
    updatedNodeData: Partial<MmpNode>,
    context: string
  ): Promise<boolean> {
    if (!shouldValidateParent(updatedNodeData)) {
      return true
    }

    const parentExists = await this.existsNode(
      mapId,
      updatedNodeData.nodeParentId!
    )

    if (!parentExists) {
      this.logger.warn(
        createParentNotFoundWarning(
          nodeId,
          updatedNodeData.nodeParentId!,
          mapId,
          context
        )
      )
    }

    return parentExists
  }

  private async saveUpdatedNode(
    existingNode: MmpNode,
    updatedNodeData: Partial<MmpNode>
  ): Promise<MmpNode> {
    return await this.nodesRepository.save({
      ...existingNode,
      ...updatedNodeData,
      lastModified: new Date(),
    })
  }

  async updateNode(
    mapId: string,
    clientNode: IMmpClientNode
  ): Promise<MmpNode | undefined> {
    const existingNode = await this.nodesRepository.findOne({
      where: { nodeMapId: mapId, id: clientNode.id },
    })

    if (!existingNode) {
      this.logger.warn(
        `updateNode(): Existing node on server for given client node ${clientNode.id} has not been found.`
      )
      return
    }

    const updatedNodeData = mapClientNodeToMmpNode(clientNode, mapId)

    const parentIsValid = await this.validateNodeParentExists(
      mapId,
      clientNode.id,
      updatedNodeData,
      'updateNode()'
    )

    if (!parentIsValid) {
      return undefined
    }

    try {
      return await this.saveUpdatedNode(existingNode, updatedNodeData)
    } catch (error) {
      this.logger.error(
        `${error instanceof Error ? error.constructor.name : 'Unknown'} updateNode(): Failed to update node ${existingNode.id}: ${error instanceof Error ? error.message : String(error)}`
      )
      return Promise.reject(error)
    }
  }

  async removeNode(
    clientNode: IMmpClientNode,
    mapId: string
  ): Promise<MmpNode | undefined> {
    const existingNode = await this.nodesRepository.findOneBy({
      id: clientNode.id,
      nodeMapId: mapId,
    })

    if (!existingNode) {
      return
    }

    return this.nodesRepository.remove(existingNode)
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
      return Promise.reject(error)
    }
  }

  async createEmptyMap(rootNode?: IMmpClientNodeBasics): Promise<MmpMap> {
    const newMap: MmpMap = this.mapsRepository.create()
    const savedNewMap: MmpMap = await this.mapsRepository.save(newMap)

    if (rootNode) {
      await this.createRootNodeForMap(rootNode, savedNewMap.id)
    }

    return newMap
  }

  // updates map nodes
  async updateMap(clientMap: IMmpClientMap): Promise<MmpMap | null> {
    // remove existing nodes, otherwise we will end up with multiple roots
    await this.nodesRepository.delete({ nodeMapId: clientMap.uuid })
    // Add new nodes from given map
    await this.addNodesFromClient(clientMap.uuid, clientMap.data)
    // reload map
    return this.findMap(clientMap.uuid)
  }

  async updateMapByDiff(mapId: string, diff: IMmpClientMapDiff) {
    type DiffCallback = (diff: IMmpClientSnapshotChanges) => Promise<void>
    type DiffKey = keyof IMmpClientMapDiff

    const diffAddedCallback: DiffCallback = async (
      diff: IMmpClientSnapshotChanges
    ) => {
      const nodes = Object.values(diff)
      await this.addNodesFromClient(mapId, nodes as IMmpClientNode[])
    }

    const updateSingleNodeFromDiff = async (
      key: string,
      clientNode: Partial<IMmpClientNode> | undefined
    ): Promise<void> => {
      if (!clientNode) return

      const serverNode = await this.nodesRepository.findOne({
        where: { nodeMapId: mapId, id: key },
      })

      if (!serverNode) return

      const mergedNode = mergeClientNodeIntoMmpNode(clientNode, serverNode)

      const parentIsValid = await this.validateNodeParentExists(
        mapId,
        key,
        mergedNode,
        'diffUpdatedCallback()'
      )

      if (!parentIsValid) return

      Object.assign(serverNode, mergedNode)

      try {
        await this.nodesRepository.save(serverNode)
      } catch (error) {
        this.logger.error(
          `${error instanceof Error ? error.constructor.name : 'Unknown'} diffUpdatedCallback(): Failed to update node ${serverNode.id}: ${error instanceof Error ? error.message : String(error)}`
        )
        return Promise.reject(error)
      }
    }

    const diffUpdatedCallback: DiffCallback = async (
      diff: IMmpClientSnapshotChanges
    ) => {
      await Promise.all(
        Object.keys(diff).map(async (key) =>
          updateSingleNodeFromDiff(key, diff[key])
        )
      )
    }

    const diffDeletedCallback: DiffCallback = async (
      diff: IMmpClientSnapshotChanges
    ) => {
      await Promise.all(
        Object.keys(diff).map(async (key) => {
          const existingNode = await this.nodesRepository.findOneBy({
            id: key,
            nodeMapId: mapId,
          })

          if (!existingNode) {
            return
          }

          return this.nodesRepository.remove(existingNode)
        })
      )
    }

    const callbacks: Record<keyof IMmpClientMapDiff, DiffCallback> = {
      added: diffAddedCallback,
      updated: diffUpdatedCallback,
      deleted: diffDeletedCallback,
    }

    const diffKeys: DiffKey[] = ['added', 'updated', 'deleted']

    for (const key of diffKeys) {
      const changes = diff[key]
      if (changes && Object.keys(changes).length > 0) {
        try {
          await callbacks[key](changes)
        } catch (error) {
          this.logger.error(
            `Failed to apply ${key} changes in updateMapByDiff: ${error instanceof Error ? error.message : String(error)}`
          )
          // Continue processing other changes even if one fails
        }
      }
    }
  }

  async updateMapOptions(
    mapId: string,
    clientOptions: IMmpClientMapOptions
  ): Promise<MmpMap | null> {
    await this.mapsRepository.update(mapId, { options: clientOptions })

    return await this.mapsRepository.findOne({ where: { id: mapId } })
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

    // get newest node of this map:
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
    // dont modify original input as this might be used somewhere else
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
          // subquery to get the newest node and its lastModified date of this map:
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

    // no maps found to be deleted:
    return 0
  }

  deleteMap(uuid: string) {
    this.mapsRepository.delete({ id: uuid })
  }

  async validatesNodeParentForNode(
    mapId: string,
    node: MmpNode
  ): Promise<boolean> {
    return (
      node.root ||
      node.detached ||
      (!!node.nodeParentId && (await this.existsNode(mapId, node.nodeParentId)))
    )
  }
}
