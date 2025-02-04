import { Inject, UseGuards, Logger } from '@nestjs/common'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Cache } from 'cache-manager'
import { randomBytes } from 'crypto'
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets'
import { Server, Socket } from 'socket.io'
import { MapsService } from '../services/maps.service'
import {
  IClientCache,
  IMmpClientDeleteRequest,
  IMmpClientEditingRequest,
  IMmpClientJoinRequest,
  IMmpClientMap,
  IMmpClientMapRequest,
  IMmpClientNodeAddRequest,
  IMmpClientNodeRequest,
  IMmpClientNodeSelectionRequest,
  IMmpClientUndoRedoRequest,
  IMmpClientUpdateMapOptionsRequest,
} from '../types'
import { mapMmpNodeToClient } from '../utils/clientServerMapping'
import { MmpMap } from '../entities/mmpMap.entity'
import { MmpNode } from '../entities/mmpNode.entity'
import { EditGuard } from '../guards/edit.guard'

// For possible configuration options please see:
// https://socket.io/docs/v4/server-initialization/
@WebSocketGateway({ cors: { credentials: true }, maxHttpBufferSize: 2e6 })
export class MapsGateway implements OnGatewayDisconnect {
  @WebSocketServer()
  server: Server

  private readonly logger = new Logger(MapsService.name)

  constructor(
    private mapsService: MapsService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache
  ) {}

  @SubscribeMessage('leave')
  async handleDisconnect(client: Socket) {
    const mapId: string | undefined | null = await this.cacheManager.get(
      client.id
    )
    if (!mapId) return

    this.server.to(mapId).emit('clientDisconnect', client.id)
    this.removeClientForMap(mapId, client.id)
    this.cacheManager.del(client.id)
    client.leave(mapId)
  }

  @SubscribeMessage('join')
  async onJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() request: IMmpClientJoinRequest
  ): Promise<IMmpClientMap | undefined> {
    const map = await this.mapsService.findMap(request.mapId)
    if (!map) {
      this.logger.warn(
        `onJoin(): Could not find map ${request.mapId} when client ${client.id} tried to join`
      )
      return
    }

    client.join(request.mapId)
    this.cacheManager.set(client.id, request.mapId, 10000)
    const updatedClientCache: IClientCache = await this.addClientForMap(
      request.mapId,
      client.id,
      request.color
    )

    this.server.to(request.mapId).emit('clientListUpdated', updatedClientCache)

    return await this.mapsService.exportMapToClient(request.mapId)
  }

  @SubscribeMessage('checkModificationSecret')
  async checkmodificationSecret(
    @ConnectedSocket() client: Socket,
    @MessageBody() request: IMmpClientEditingRequest
  ): Promise<boolean> {
    const map = await this.mapsService.findMap(request.mapId)
    if (!map || !map.modificationSecret) return true

    return request.modificationSecret === map?.modificationSecret
  }

  @UseGuards(EditGuard)
  @SubscribeMessage('updateMapOptions')
  async onUpdateMap(
    @ConnectedSocket() _client: Socket,
    @MessageBody() request: IMmpClientUpdateMapOptionsRequest
  ): Promise<boolean> {
    const updatedMap: MmpMap | null = await this.mapsService.updateMapOptions(
      request.mapId,
      request.options
    )
    this.server.to(request.mapId).emit('mapOptionsUpdated', updatedMap)

    return true
  }

  @SubscribeMessage('deleteMap')
  async onDeleteMap(
    @ConnectedSocket() _client: Socket,
    @MessageBody() request: IMmpClientDeleteRequest
  ): Promise<boolean> {
    const mmpMap: MmpMap | null = await this.mapsService.findMap(request.mapId)
    if (mmpMap && mmpMap.adminId === request.adminId) {
      this.mapsService.deleteMap(request.mapId)
      this.server.to(request.mapId).emit('mapDeleted')
      return true
    }
    return false
  }

  @UseGuards(EditGuard)
  @SubscribeMessage('addNodes')
  async addNode(
    @ConnectedSocket() client: Socket,
    @MessageBody() request: IMmpClientNodeAddRequest
  ): Promise<boolean> {
    const newNodes = await this.mapsService.addNodesFromClient(
      request.mapId,
      request.nodes
    )
    if (!newNodes || newNodes.length === 0) return false

    this.server.to(request.mapId).emit('nodesAdded', {
      clientId: client.id,
      nodes: newNodes.map((newNode) => mapMmpNodeToClient(newNode)),
    })

    // when pasting (inserting multiple nodes), do not update selection
    if (newNodes.length === 1) {
      this.server.to(request.mapId).emit('selectionUpdated', {
        clientId: client.id,
        nodeId: newNodes[newNodes.length - 1]?.id,
        selected: true,
      })
    }

    return true
  }

  @UseGuards(EditGuard)
  @SubscribeMessage('updateNode')
  async updateNode(
    @ConnectedSocket() client: Socket,
    @MessageBody() request: IMmpClientNodeRequest
  ): Promise<boolean> {
    if (!request.node) return false

    const updatedNode = await this.mapsService.updateNode(
      request.mapId,
      request.node
    )

    if (!updatedNode) return false

    this.server.to(request.mapId).emit('nodeUpdated', {
      clientId: client.id,
      property: request.updatedProperty,
      node: mapMmpNodeToClient(updatedNode),
    })

    return true
  }

  @UseGuards(EditGuard)
  @SubscribeMessage('applyMapChangesByDiff')
  async applyMapChangesByDiff(
    @ConnectedSocket() client: Socket,
    @MessageBody() request: IMmpClientUndoRedoRequest
  ): Promise<boolean> {
    if (!(await this.mapsService.findMap(request.mapId)))
      return Promise.resolve(false)
    if (!request.diff) return Promise.resolve(false)

    await this.mapsService.updateMapByDiff(request.mapId, request.diff)

    this.server
      .to(request.mapId)
      .emit('mapChangesUndoRedo', { clientId: client.id, diff: request.diff })

    return true
  }

  @UseGuards(EditGuard)
  @SubscribeMessage('updateMap')
  async updateMap(
    @ConnectedSocket() client: Socket,
    @MessageBody() request: IMmpClientMapRequest
  ): Promise<boolean> {
    if (!(await this.mapsService.findMap(request.mapId)))
      return Promise.resolve(false)

    const mmpMap: IMmpClientMap = request.map

    // Disconnect all clients temporarily
    // Emit an event so clients can display a notification
    this.server.to(mmpMap.uuid).emit('clientNotification', {
      clientId: client.id,
      message: 'TOASTS.WARNINGS.MAP_IMPORT_IN_PROGRESS',
      type: 'warning',
    })

    const sockets = await this.server.in(request.mapId).fetchSockets()
    this.server.in(request.mapId).socketsLeave(request.mapId)

    await this.mapsService.updateMap(mmpMap)

    // Reconnect clients once map is updated
    sockets.forEach((socket) => {
      // socketsJoin() doesn't work here as the sockets have left the room and this.server.in(request.mapId) would return nothing
      socket.join(request.mapId)
    })

    const exportMap = await this.mapsService.exportMapToClient(mmpMap.uuid)

    this.server
      .to(mmpMap.uuid)
      .emit('mapUpdated', { clientId: client.id, map: exportMap })

    this.server.to(mmpMap.uuid).emit('clientNotification', {
      clientId: client.id,
      message: 'TOASTS.MAP_IMPORT_SUCCESS',
      type: 'success',
    })

    return true
  }

  @UseGuards(EditGuard)
  @SubscribeMessage('removeNode')
  async removeNode(
    @ConnectedSocket() client: Socket,
    @MessageBody() request: IMmpClientNodeRequest
  ): Promise<MmpNode | undefined> {
    const removedNode: MmpNode | undefined = await this.mapsService.removeNode(
      request.node,
      request.mapId
    )

    this.server.to(request.mapId).emit('nodeRemoved', {
      clientId: client.id,
      nodeId: request?.node?.id,
    })

    return removedNode
  }

  @SubscribeMessage('updateNodeSelection')
  async updateNodeSelection(
    @ConnectedSocket() client: Socket,
    @MessageBody() request: IMmpClientNodeSelectionRequest
  ): Promise<boolean> {
    this.server.to(request.mapId).emit('selectionUpdated', {
      clientId: client.id,
      nodeId: request.nodeId,
      selected: request.selected,
    })

    return true
  }

  private async addClientForMap(
    mapId: string,
    clientId: string,
    color: string
  ): Promise<IClientCache> {
    const currentClientCache: IClientCache =
      (await this.cacheManager.get(mapId)) || {}
    const overwriteColor = this.chooseColor(currentClientCache, color)

    const newClientCache: IClientCache = {
      ...currentClientCache,
      [clientId]: overwriteColor,
    }
    await this.cacheManager.set(mapId, newClientCache, 10000)
    return newClientCache
  }

  private async removeClientForMap(mapId: string, clientId: string) {
    const currentClientCache: IClientCache =
      (await this.cacheManager.get(mapId)) || {}
    delete currentClientCache[clientId]
    this.cacheManager.set(mapId, currentClientCache, 10000)
  }

  private chooseColor(currentClientCache: IClientCache, color: string): string {
    // in case of a color collision, pick a random color
    const usedColors: string[] = Object.values(currentClientCache)
    if (usedColors.includes(color)) return `#${randomBytes(3).toString('hex')}`

    return color
  }
}
