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
  IMmpClientSnapshotChanges
} from '../types'
import {
  mapClientBasicNodeToMmpRootNode,
  mapClientNodeToMmpNode,
  mapMmpMapToClient,
  mergeClientNodeIntoMmpNode,
} from '../utils/clientServerMapping'
import configService from '../../config.service'
import { validate as uuidValidate } from 'uuid';
import MalformedUUIDError from './uuid.error'

@Injectable()
export class MapsService {
  private readonly logger = new Logger(MapsService.name)
  
  constructor(
    @InjectRepository(MmpNode)
    private nodesRepository: Repository<MmpNode>,
    @InjectRepository(MmpMap)
    private mapsRepository: Repository<MmpMap>,
  ) { }

  findMap(uuid: string): Promise<MmpMap | null> {
    if (!uuidValidate(uuid)) return Promise.reject(new MalformedUUIDError('Invalid UUID'))

    return this.mapsRepository.findOne({
      where: { id: uuid },
    })
  }

  async updateLastAccessed(uuid: string, lastAccessed = new Date()) {
    this.mapsRepository.update(uuid, { lastAccessed })
  }

  async exportMapToClient(uuid: string): Promise<IMmpClientMap> {
    const map = await this.findMap(uuid).catch((e: Error) => {
      return Promise.reject(e)
    })

    if (!map) return Promise.reject()

    const nodes: MmpNode[] = await this.findNodes(map?.id)
    const days: number = configService.deleteAfterDays()

    return mapMmpMapToClient(
      map,
      nodes,
      await this.getDeletedAt(map, days),
      days
    )
  }

  async addNode(mapId: string, node: MmpNode): Promise<MmpNode> {
    // detached nodes are not allowed to have a parent
    if (node.detached && node.nodeParentId) return Promise.reject()
    // root nodes are not allowed to have a parent
    if (node.root && node.nodeParentId) return Promise.reject()
    if (!mapId || !node) return Promise.reject()

    const existingNode = await this.nodesRepository.findOne({
      where: { id: node.id, nodeMapId: mapId },
    })
    if (existingNode) return existingNode

    const newNode = this.nodesRepository.create({
      ...node,
      nodeMapId: mapId,
    })

    return this.nodesRepository.save(newNode)
  }

  async addNodesFromClient(
    mapId: string,
    clientNodes: IMmpClientNode[]
  ): Promise<MmpNode[]> {
    const mmpNodes = clientNodes.map(x => mapClientNodeToMmpNode(x, mapId))
    return await this.addNodes(mapId, mmpNodes)
  }

  async addNodes(
    mapId: string,
    nodes: Partial<MmpNode>[]
  ): Promise<MmpNode[]> {
    if (!mapId || nodes.length === 0) Promise.reject()

      const reducer = async (previousPromise: Promise<MmpNode[]>, node: MmpNode): Promise<MmpNode[]> => {
        const accCreatedNodes = await previousPromise;
        if (await this.validatesNodeParentForNode(mapId, node)) {
          try {
            const newNode = await this.addNode(mapId, node);
            return accCreatedNodes.concat([newNode]);
          } catch (error) {
            this.logger.warn(`Failed to add node ${node.id} to map ${mapId}: ${error}`);
            return accCreatedNodes;
          }
        }
    
        this.logger.warn(`Parent with id ${node.nodeParentId} does not exist for node ${node.id} and map ${mapId}`);
        return accCreatedNodes;
      };


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

  async updateNode(
    mapId: string,
    clientNode: IMmpClientNode
  ): Promise<MmpNode> {
    const existingNode = await this.nodesRepository.findOne({
      where: { nodeMapId: mapId, id: clientNode.id },
    })

    if (!existingNode) return Promise.reject()

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

  async createEmptyMap(rootNode?: IMmpClientNodeBasics): Promise<MmpMap> {
    const newMap: MmpMap = this.mapsRepository.create()
    const savedNewMap: MmpMap = await this.mapsRepository.save(newMap)

    if (rootNode) {
      const newRootNode = this.nodesRepository.create(
        mapClientBasicNodeToMmpRootNode(rootNode, savedNewMap.id)
      )
      await this.nodesRepository.save(newRootNode)
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
    type DiffCallback = (diff: IMmpClientSnapshotChanges) => Promise<void>;
    type DiffKey = keyof IMmpClientMapDiff;

    const diffAddedCallback: DiffCallback = async (diff: IMmpClientSnapshotChanges) => {
      // Sort keys so parents come before children
      const sortedKeys = Object.keys(diff).sort((a, b) => {
        const nodeA = diff[a];
        const nodeB = diff[b];
        return nodeB!.parent === nodeA!.id ? -1 : 1;  // Parent nodes come first
      });
    
      // Then process in order
      for (const key of sortedKeys) {
        const clientNode = diff[key];
        if (clientNode) {
          const newNode = new MmpNode();
          Object.assign(newNode, mergeClientNodeIntoMmpNode(clientNode, newNode));
          newNode.nodeMapId = mapId;
          await this.nodesRepository.save(newNode);
        }
      }
    }

    const diffUpdatedCallback: DiffCallback = async (diff: IMmpClientSnapshotChanges) => {
      await Promise.all(Object.keys(diff).map(async (key) => {
        const clientNode = diff[key];

        if (clientNode) {
          const serverNode = await this.nodesRepository.findOne({ where: { id: key } });
        
          if (serverNode) {
            const mergedNode = mergeClientNodeIntoMmpNode(clientNode, serverNode);
            Object.assign(serverNode, mergedNode);
            await this.nodesRepository.save(serverNode);
          }
        }
      }));
    }

    const diffDeletedCallback: DiffCallback = async (diff: IMmpClientSnapshotChanges) => {
      await Promise.all(Object.keys(diff).map(async (key) => {
        await this.nodesRepository.delete({ id: key, nodeMapId: mapId });
      }));
    }

    const callbacks: Record<keyof IMmpClientMapDiff, DiffCallback> = {
      added: diffAddedCallback,
      updated: diffUpdatedCallback,
      deleted: diffDeletedCallback
    };

    const diffKeys: DiffKey[] = ["added", "updated", "deleted"];
    
    diffKeys.forEach(key => {
      const changes = diff[key];
      if (changes && Object.keys(changes).length > 0) {
        callbacks[key](changes);
      }
    });
  }

  async updateMapOptions(
    mapId: string,
    clientOptions: IMmpClientMapOptions
  ): Promise<MmpMap | null> {
    await this.mapsRepository.update(mapId, { options: clientOptions })

    return await this.mapsRepository.findOne({ where: { id: mapId } })
  }

  async getDeletedAt(map: MmpMap, afterDays: number): Promise<Date> {
    if (!map) return Promise.reject()

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

    return this.calculcateDeletedAt(lastAccessed ? new Date(lastAccessed) : new Date(lastModified), afterDays)
  }

  calculcateDeletedAt(lastModified: Date, afterDays: number): Date {
    // dont modify original input as this might be used somewhere else
    const copyDate: Date = new Date(lastModified.getTime())
    copyDate.setDate(copyDate.getDate() + afterDays)
    return copyDate
  }

  async deleteOutdatedMaps(afterDays: number = 30): Promise<number | null | undefined> {
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
