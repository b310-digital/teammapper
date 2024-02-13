import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, Brackets } from 'typeorm'
import { MmpMap } from '../entities/mmpMap.entity'
import { MmpNode } from '../entities/mmpNode.entity'
import {
  IMmpClientMap,
  IMmpClientMapOptions,
  IMmpClientNode,
  IMmpClientNodeBasics,
} from '../types'
import {
  mapClientBasicNodeToMmpRootNode,
  mapClientNodeToMmpNode,
  mapMmpMapToClient,
} from '../utils/clientServerMapping'
import configService from '../../config.service'

@Injectable()
export class MapsService {
  private readonly logger = new Logger(MapsService.name)

  constructor(
    @InjectRepository(MmpNode)
    private nodesRepository: Repository<MmpNode>,
    @InjectRepository(MmpMap)
    private mapsRepository: Repository<MmpMap>
  ) {}

  findMap(uuid: string): Promise<MmpMap> {
    return this.mapsRepository.findOne({
      where: { id: uuid },
    })
  }

  async exportMapToClient(uuid: string): Promise<IMmpClientMap> {
    const map: MmpMap = await this.findMap(uuid)
    if (!map) return null

    const nodes: MmpNode[] = await this.findNodes(map?.id)
    const days: number = configService.deleteAfterDays()
    return mapMmpMapToClient(
      map,
      nodes,
      await this.getDeletedAt(map, days),
      days
    )
  }

  async addNode(mapId: string, clientNode: IMmpClientNode): Promise<MmpNode> {
    // detached nodes are not allowed to have a parent
    if (clientNode.detached && clientNode.parent) return
    if (!mapId || !clientNode) return

    const existingNode = await this.nodesRepository.findOne({
      where: { id: clientNode.id, nodeMapId: mapId },
    })
    if (existingNode) return existingNode

    const newNode = this.nodesRepository.create({
      ...mapClientNodeToMmpNode(clientNode, mapId),
      nodeMapId: mapId,
    })
    return this.nodesRepository.save(newNode)
  }

  async addNodes(
    mapId: string,
    clientNodes: IMmpClientNode[]
  ): Promise<MmpNode[]> {
    if (!mapId || clientNodes.length === 0) return

    const reducer = async (
      previousPromise: Promise<MmpNode[]>,
      clientNode: IMmpClientNode
    ): Promise<MmpNode[]> => {
      const accCreatedNodes = await previousPromise

      if (await this.validatesNodeParentForClientNode(mapId, clientNode)) {
        return accCreatedNodes.concat([await this.addNode(mapId, clientNode)])
      }

      this.logger.warn(
        `Parent with id ${clientNode.parent} does not exist for node ${clientNode.id} and map ${mapId}`
      )
      this.logger.warn(clientNodes.map((node) => [node.id, node.parent]))
      return accCreatedNodes
    }

    return clientNodes.reduce(reducer, Promise.resolve(new Array<MmpNode>()))
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

  async updateNode(
    mapId: string,
    clientNode: IMmpClientNode
  ): Promise<MmpNode> {
    const existingNode = await this.nodesRepository.findOne({
      where: { nodeMapId: mapId, id: clientNode.id },
    })

    if (!existingNode) return

    return this.nodesRepository.save({
      ...existingNode,
      ...mapClientNodeToMmpNode(clientNode, mapId),
      lastModified: new Date(),
    })
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

  async createEmptyMap(rootNode: IMmpClientNodeBasics): Promise<MmpMap> {
    const newMap: MmpMap = this.mapsRepository.create()
    const savedNewMap: MmpMap = await this.mapsRepository.save(newMap)
    const newRootNode = this.nodesRepository.create(
      mapClientBasicNodeToMmpRootNode(rootNode, savedNewMap.id)
    )
    await this.nodesRepository.save(newRootNode)

    return newMap
  }

  // updates map nodes
  async updateMap(clientMap: IMmpClientMap): Promise<MmpMap> {
    // remove existing nodes, otherwise we will end up with multiple roots
    await this.nodesRepository.delete({ nodeMapId: clientMap.uuid })
    // Add new nodes from given map
    await this.addNodes(clientMap.uuid, clientMap.data)
    // reload map
    return this.findMap(clientMap.uuid)
  }

  async updateMapOptions(
    mapId: string,
    clientOptions: IMmpClientMapOptions
  ): Promise<MmpMap> {
    await this.mapsRepository.update(mapId, { options: clientOptions })

    return await this.mapsRepository.findOne({ where: { id: mapId } })
  }

  async getDeletedAt(map: MmpMap, afterDays: number): Promise<Date> {
    if (!map) return null

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

    return this.calculcateDeletedAt(new Date(lastModified), afterDays)
  }

  calculcateDeletedAt(lastModified: Date, afterDays: number): Date {
    // dont modify original input as this might be used somewhere else
    const copyDate: Date = new Date(lastModified.getTime())
    copyDate.setDate(copyDate.getDate() + afterDays)
    return copyDate
  }

  async deleteOutdatedMaps(afterDays: number = 30): Promise<number> {
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
        // delete all maps that have nodes that were last updated after afterDays
        "(lastmodifiednode.lastUpdatedAt + (INTERVAL '1 day' * :afterDays)) < :today",
        { afterDays, today }
      )
      .orWhere(
        new Brackets((qb) => {
          // also delete empty maps, use th emaps lastmodified date for this:
          qb.where('lastmodifiednode.lastUpdatedAt IS NULL').andWhere(
            "(map.lastModified + (INTERVAL '1 day' * :afterDays)) < :today",
            { afterDays, today }
          )
        })
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

  async validatesNodeParentForClientNode(
    mapId: string,
    node: IMmpClientNode
  ): Promise<boolean> {
    return (
      node.isRoot ||
      node.detached ||
      (node.parent && (await this.existsNode(mapId, node.parent)))
    )
  }
}
