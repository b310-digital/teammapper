import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { MmpMap } from '../entities/mmpMap.entity';
import { MmpNode } from '../entities/mmpNode.entity';
import { IMmpClientMap, IMmpClientNode } from '../types';
import { mapClientNodeToMmpNode, mapMmpMapToClient } from '../utils/clientServerMapping';
import configService from '../../config.service';

@Injectable()
export class MapsService {
  constructor(
    @InjectRepository(MmpNode)
    private nodesRepository: Repository<MmpNode>,
    @InjectRepository(MmpMap)
    private mapsRepository: Repository<MmpMap>,
  ) {}

  findMap(uuid: string): Promise<MmpMap> {
    return this.mapsRepository.findOne({
      where: { id: uuid },
    });
  }

  async exportMapToClient(uuid: string): Promise<IMmpClientMap> {
    const map: MmpMap = await this.findMap(uuid);
    if (map === undefined) return null;

    const nodes: MmpNode[] = await this.findNodes(map?.id);
    const days: number = configService.deleteAfterDays();
    return mapMmpMapToClient(map, nodes, this.getDeletedAt(days), days);
  }

  async addNode(mapId: string, clientNode: IMmpClientNode): Promise<MmpNode> {
    const existingNode = await this.nodesRepository.findOne({
      where: { id: clientNode.id, nodeMapId: mapId },
    });
    if (existingNode) return existingNode;

    const newNode = this.nodesRepository.create({
      ...mapClientNodeToMmpNode(clientNode, mapId),
      nodeMapId: mapId,
    });
    return this.nodesRepository.save(newNode);
  }

  async findNodes(mapId: string): Promise<MmpNode[]> {
    return this.nodesRepository.createQueryBuilder('mmpNode')
      .where('mmpNode.nodeMapId = :mapId', { mapId })
      .orderBy('mmpNode.orderNumber', 'ASC')
      .getMany();
  }

  async updateNode(
    mapId: string,
    clientNode: IMmpClientNode,
  ): Promise<MmpNode> {
    const existingNode = await this.nodesRepository.findOne({
      where: { nodeMapId: mapId, id: clientNode.id },
    });

    return this.nodesRepository.save({
      ...existingNode,
      ...mapClientNodeToMmpNode(clientNode, mapId),
    });
  }

  async removeNode(clientNode: IMmpClientNode, mapId: string): Promise<MmpNode | undefined> {
    const existingNode = await this.nodesRepository.findOne({ id: clientNode.id, nodeMapId: mapId });

    if (!existingNode) {
      return;
    }

    return this.nodesRepository.remove(existingNode);
  }

  async createMap(clientMap: IMmpClientMap): Promise<MmpMap> {
    const newMap: MmpMap = this.mapsRepository.create({
      id: clientMap.uuid,
    });
    // if the map already exists, its only upldated here
    await this.mapsRepository.save(newMap);
    // remove existing nodes, otherwise we will end up with multiple roots
    await this.nodesRepository.delete({ nodeMapId: clientMap.uuid });

    // Add new nodes from given map
    // Reduce is used in conjunction with a promise to keep the order of creation.
    // Otherwise there will be FK violations
    clientMap.data.reduce(async (promise: Promise<any>, node: IMmpClientNode) => {
      await promise;
      await this.nodesRepository.save(mapClientNodeToMmpNode(node, clientMap.uuid));
    }, Promise.resolve());

    return newMap;
  }

  getDeletedAt(afterDays: number): Date {
    const today: Date = new Date();
    const comparisonTime: Date = new Date();
    comparisonTime.setDate(today.getDate() + afterDays);
    return comparisonTime;
  }

  deleteOutdatedMaps(afterDays: number = 30) {
    this.mapsRepository.delete({ lastModified: MoreThan(this.getDeletedAt(afterDays)) });
  }

  deleteMap(uuid: string) {
    this.mapsRepository.delete({ id: uuid });
  }
}
