import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { MmpMap } from '../entities/mmpMap.entity';
import { MmpNode } from '../entities/mmpNode.entity';
import { IMmpClientMap, IMmpClientNode } from '../types';
import { mapClientNodeToMmpNode, mapMmpMapToClient } from '../utils/clientServerMapping';

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
    return mapMmpMapToClient(map, nodes);
  }

  async addNode(mapId: string, clientNode: IMmpClientNode): Promise<MmpNode> {
    const existingNode = await this.nodesRepository.findOne({
      where: { id: clientNode.id, nodeMapId: mapId },
    });
    if (existingNode) return existingNode;

    const newNode = this.nodesRepository.create({
      ...mapClientNodeToMmpNode(clientNode),
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
      ...mapClientNodeToMmpNode(clientNode),
    });
  }

  async removeNode(clientNode: IMmpClientNode): Promise<boolean> {
    const existingNode = await this.nodesRepository.findOne({ id: clientNode.id });

    if (!existingNode) {
      return false;
    }

    await this.nodesRepository.remove(existingNode);
    return true;
  }

  async createMap(clientMap: IMmpClientMap): Promise<MmpMap> {
    const newMap: MmpMap = this.mapsRepository.create({
      id: clientMap.uuid,
      lastModified: new Date(clientMap.lastModified),
      nodes: clientMap.data.map((node) => mapClientNodeToMmpNode(node)),
    });
    return this.mapsRepository.save(newMap);
  }

  deleteOutdatedMaps(afterDays: number = 30) {
    const today: Date = new Date();
    const comparisonTime: Date = new Date();
    comparisonTime.setDate(today.getDate() + afterDays);
    this.mapsRepository.delete({ lastModified: MoreThan(comparisonTime) });
  }
}
