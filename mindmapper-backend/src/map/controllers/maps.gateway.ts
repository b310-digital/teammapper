import { CACHE_MANAGER, Inject } from '@nestjs/common';
import { Cache } from 'cache-manager';
import { randomBytes } from 'crypto';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { MapsService } from '../services/maps.service';
import {
  IClientCache,
  IMmpClientDeleteRequest,
  IMmpClientJoinRequest,
  IMmpClientMap, IMmpClientMapRequest, IMmpClientNodeRequest, IMmpClientNodeSelectionRequest,
} from '../types';
import { mapMmpNodeToClient } from '../utils/clientServerMapping';
import { MmpMap } from '../entities/mmpMap.entity';


@WebSocketGateway({ cors: { credentials: true } })
export class MapsGateway implements OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(private mapsService: MapsService, @Inject(CACHE_MANAGER) private cacheManager: Cache) {}

  @SubscribeMessage('leave')
  async handleDisconnect(client: Socket) {
    const mapId: string = await this.cacheManager.get(client.id);
    this.server
      .to(mapId)
      .emit('clientDisconnect', client.id);
    this.removeClientForMap(mapId, client.id);
    this.cacheManager.del(client.id);
  }

  @SubscribeMessage('join')
  async onJoin(
    @ConnectedSocket() client: Socket,
      @MessageBody() request: IMmpClientJoinRequest,
  ): Promise<IMmpClientMap> {
    client.join(request.mapId);
    this.cacheManager.set(client.id, request.mapId, { ttl: 10000 });
    const updatedClientCache: IClientCache = await this.addClientForMap(request.mapId, client.id, request.color);

    this.server
      .to(request.mapId)
      .emit('clientListUpdated', updatedClientCache);

    return this.mapsService.exportMapToClient(request.mapId);
  }

  @SubscribeMessage('createMap')
  async onCreateMap(
    @ConnectedSocket() _client: Socket,
      @MessageBody() mmpMap: IMmpClientMap,
  ): Promise<boolean> {
    await this.mapsService.createMap(mmpMap);
    return true;
  }

  @SubscribeMessage('deleteMap')
  async onDeleteMap(
    @ConnectedSocket() _client: Socket,
      @MessageBody() request: IMmpClientDeleteRequest,
  ): Promise<boolean> {
    const mmpMap: MmpMap = await this.mapsService.findMap(request.mapId);
    if (mmpMap.adminId === request.adminId) {
      this.mapsService.deleteMap(request.mapId);
      this.server
        .to(request.mapId)
        .emit('mapDeleted');
      return true;
    }
    return false;
  }

  @SubscribeMessage('addNode')
  async addNode(
    @ConnectedSocket() client: Socket,
      @MessageBody() request: IMmpClientNodeRequest,
  ): Promise<boolean> {
    const newNode = await this.mapsService.addNode(request.mapId, request.node);
    this.server
      .to(request.mapId)
      .emit('nodeAdded', { clientId: client.id, node: mapMmpNodeToClient(newNode) });

    return true;
  }

  @SubscribeMessage('updateNode')
  async updateNode(
    @ConnectedSocket() client: Socket,
      @MessageBody() request: IMmpClientNodeRequest,
  ): Promise<boolean> {
    if (!request.node) return false;

    const updatedNode = await this.mapsService.updateNode(
      request.mapId,
      request.node,
    );
    this.server
      .to(request.mapId)
      .emit('nodeUpdated', { clientId: client.id, property: request.updatedProperty, node: mapMmpNodeToClient(updatedNode) });

    return true;
  }

  @SubscribeMessage('updateMap')
  async updateMap(
    @ConnectedSocket() client: Socket,
      @MessageBody() request: IMmpClientMapRequest,
  ): Promise<boolean> {
    const mmpMap: IMmpClientMap = request.map;

    await this.mapsService.createMap(
      mmpMap,
    );
    const exportMap = await this.mapsService.exportMapToClient(mmpMap.uuid);

    this.server
      .to(mmpMap.uuid)
      .emit('mapUpdated', { clientId: client.id, map: exportMap });

    return true;
  }

  @SubscribeMessage('removeNode')
  async removeNode(
    @ConnectedSocket() client: Socket,
      @MessageBody() request: IMmpClientNodeRequest,
  ): Promise<boolean> {
    const nodeRemoveStatus: boolean = await this.mapsService.removeNode(
      request.node,
    );

    this.server
      .to(request.mapId)
      .emit('nodeRemoved', { clientId: client.id, nodeId: request?.node?.id });

    return nodeRemoveStatus;
  }

  @SubscribeMessage('updateNodeSelection')
  async updateNodeSelection(
    @ConnectedSocket() client: Socket,
      @MessageBody() request: IMmpClientNodeSelectionRequest,
  ): Promise<boolean> {
    this.server
      .to(request.mapId)
      .emit('selectionUpdated', { clientId: client.id, nodeId: request.nodeId, selected: request.selected });

    return true;
  }

  private async addClientForMap(mapId: string, clientId: string, color: string): Promise<IClientCache> {
    const currentClientCache: IClientCache = await this.cacheManager.get(mapId) || {};
    const overwriteColor = this.chooseColor(currentClientCache, color);

    const newClientCache: IClientCache = { ...currentClientCache, [clientId]: overwriteColor };
    await this.cacheManager.set(mapId, newClientCache, { ttl: 10000 });
    return newClientCache;
  }

  private async removeClientForMap(mapId: string, clientId: string) {
    const currentClientCache: IClientCache = await this.cacheManager.get(mapId) || {};
    delete currentClientCache[clientId];
    this.cacheManager.set(mapId, currentClientCache, { ttl: 10000 });
  }

  private chooseColor(currentClientCache: IClientCache, color: string): string {
    // in case of a color collision, pick a random color
    const usedColors: string[] = Object.values(currentClientCache);
    if (usedColors.includes(color)) return `#${randomBytes(3).toString('hex')}`;

    return color;
  }
}
