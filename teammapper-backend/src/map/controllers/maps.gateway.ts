import { CACHE_MANAGER, Inject, UseGuards } from '@nestjs/common';
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
  IMmpClientEditingRequest,
  IMmpClientJoinRequest,
  IMmpClientMap, IMmpClientMapRequest, IMmpClientNodeRequest, IMmpClientNodeSelectionRequest, IMmpClientUpdateMapOptionsRequest,
} from '../types';
import { mapMmpNodeToClient } from '../utils/clientServerMapping';
import { MmpMap } from '../entities/mmpMap.entity';
import { MmpNode } from '../entities/mmpNode.entity';
import { EditGuard } from '../guards/edit.guard';

// For possible configuration options please see:
// https://socket.io/docs/v4/server-initialization/
@WebSocketGateway({ cors: { credentials: true }, maxHttpBufferSize: 2e6 })
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

  @SubscribeMessage('checkModificationSecret')
  async checkmodificationSecret(
    @ConnectedSocket() client: Socket,
    @MessageBody() request: IMmpClientEditingRequest,
  ): Promise<boolean> {
    const map = await this.mapsService.findMap(request.mapId)
    console.log(map)
    if(!map.modificationSecret) return true

    return request.modificationSecret == map.modificationSecret;
  }

  @UseGuards(EditGuard)
  @SubscribeMessage('updateMapOptions')
  async onUpdateMap(
    @ConnectedSocket() _client: Socket,
    @MessageBody() request: IMmpClientUpdateMapOptionsRequest,
  ): Promise<boolean> {
    const updatedMap: MmpMap = await this.mapsService.updateMapOptions(request.mapId, request.options);
    this.server
        .to(request.mapId)
        .emit('mapOptionsUpdated', updatedMap);

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

  @UseGuards(EditGuard)
  @SubscribeMessage('addNode')
  async addNode(
    @ConnectedSocket() client: Socket,
    @MessageBody() request: IMmpClientNodeRequest,
  ): Promise<boolean> {
    const newNode = await this.mapsService.addNode(request.mapId, request.node);
    this.server
      .to(request.mapId)
      .emit('nodeAdded', { clientId: client.id, node: mapMmpNodeToClient(newNode) });
    
    this.server
      .to(request.mapId)
      .emit('selectionUpdated', { clientId: client.id, nodeId: newNode.id, selected: true });

    return true;
  }

  @UseGuards(EditGuard)
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

  @UseGuards(EditGuard)
  @SubscribeMessage('updateMap')
  async updateMap(
    @ConnectedSocket() client: Socket,
    @MessageBody() request: IMmpClientMapRequest,
  ): Promise<boolean> {
    const mmpMap: IMmpClientMap = request.map;
    await this.mapsService.updateMap(
      mmpMap,
    );
    
    const exportMap = await this.mapsService.exportMapToClient(mmpMap.uuid);

    this.server
      .to(mmpMap.uuid)
      .emit('mapUpdated', { clientId: client.id, map: exportMap });

    return true;
  }

  @UseGuards(EditGuard)
  @SubscribeMessage('removeNode')
  async removeNode(
    @ConnectedSocket() client: Socket,
    @MessageBody() request: IMmpClientNodeRequest,
  ): Promise<MmpNode | undefined> {
    const removedNode: MmpNode | undefined = await this.mapsService.removeNode(
      request.node,
      request.mapId,
    );

    this.server
      .to(request.mapId)
      .emit('nodeRemoved', { clientId: client.id, nodeId: request?.node?.id });

    return removedNode;
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

