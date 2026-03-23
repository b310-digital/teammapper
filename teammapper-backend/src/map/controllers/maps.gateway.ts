import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Inject, Logger, UseGuards } from '@nestjs/common'
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets'
import { Cache } from 'cache-manager'
import { randomBytes } from 'crypto'
import { Server, Socket } from 'socket.io'
import { QueryFailedError } from 'typeorm'
import { MmpNode } from '../entities/mmpNode.entity'
import { EditGuard } from '../guards/edit.guard'
import { MapsService } from '../services/maps.service'
import {
  IClientCache,
  IMmpClientMap,
  IMmpClientMapDiff,
  IMmpClientNode,
  OperationResponse,
} from '../types'
import {
  JoinSchema,
  CheckModificationSecretSchema,
  NodeSelectionSchema,
  UpdateMapOptionsSchema,
  DeleteRequestSchema,
  NodeAddRequestSchema,
  NodeRequestSchema,
  NodeRemoveRequestSchema,
  UndoRedoRequestSchema,
  MapRequestSchema,
  validateWsPayload,
} from '../schemas/gateway.schema'
import {
  mapClientNodeToMmpNode,
  mapMmpNodeToClient,
} from '../utils/clientServerMapping'
import { GatewayHelpers } from './gateway-helpers'

// For possible configuration options please see:
// https://socket.io/docs/v4/server-initialization/
@WebSocketGateway({ cors: { credentials: true }, maxHttpBufferSize: 2e6 })
export class MapsGateway implements OnGatewayDisconnect {
  @WebSocketServer()
  server: Server

  private readonly logger = new Logger(MapsService.name)
  // 24 hours – entries are cleaned up explicitly on disconnect
  private readonly CACHE_TTL_MS = 86_400_000
  private helpers: GatewayHelpers

  constructor(
    private mapsService: MapsService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache
  ) {}

  private getHelpers(): GatewayHelpers {
    if (!this.helpers) {
      this.helpers = new GatewayHelpers(
        this.server,
        this.mapsService,
        this.logger
      )
    }
    return this.helpers
  }

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
    @MessageBody() request: unknown
  ): Promise<IMmpClientMap | undefined> {
    const validated = validateWsPayload(client, JoinSchema, request)
    if (!validated) return undefined
    try {
      const map = await this.mapsService.findMap(validated.mapId)
      if (!map) {
        this.logger.warn(
          `onJoin(): Could not find map ${validated.mapId} when client ${client.id} tried to join`
        )
        return
      }

      const updatedClientCache = await this.setupClientRoomMembership(
        client,
        validated.mapId,
        validated.color
      )

      this.server
        .to(validated.mapId)
        .emit('clientListUpdated', updatedClientCache)

      return await this.mapsService.exportMapToClient(validated.mapId)
    } catch (error) {
      this.logger.error(
        `Failed to join map: ${error instanceof Error ? error.message : String(error)}`
      )
      return undefined
    }
  }

  @SubscribeMessage('checkModificationSecret')
  async checkmodificationSecret(
    @ConnectedSocket() client: Socket,
    @MessageBody() request: unknown
  ): Promise<boolean> {
    const validated = validateWsPayload(
      client,
      CheckModificationSecretSchema,
      request
    )
    if (!validated) return false
    try {
      const map = await this.mapsService.findMap(validated.mapId)
      if (!map || !map.modificationSecret) return true

      return validated.modificationSecret === map?.modificationSecret
    } catch (error) {
      this.logger.error(
        `Failed to check modification secret: ${error instanceof Error ? error.message : String(error)}`
      )
      return false
    }
  }

  @UseGuards(EditGuard)
  @SubscribeMessage('updateMapOptions')
  async onUpdateMap(
    @ConnectedSocket() client: Socket,
    @MessageBody() request: unknown
  ): Promise<boolean> {
    const validated = validateWsPayload(client, UpdateMapOptionsSchema, request)
    if (!validated) return false
    const updatedMap = await this.mapsService.updateMapOptions(
      validated.mapId,
      validated.options
    )
    this.server.to(validated.mapId).emit('mapOptionsUpdated', updatedMap)

    return true
  }

  @SubscribeMessage('deleteMap')
  async onDeleteMap(
    @ConnectedSocket() client: Socket,
    @MessageBody() request: unknown
  ): Promise<boolean> {
    const validated = validateWsPayload(client, DeleteRequestSchema, request)
    if (!validated) return false
    try {
      const mmpMap = await this.mapsService.findMap(validated.mapId)
      if (mmpMap && mmpMap.adminId === validated.adminId) {
        await this.mapsService.deleteMap(validated.mapId)
        this.server.to(validated.mapId).emit('mapDeleted')
        return true
      }
      return false
    } catch (error) {
      this.logger.error(
        `Failed to delete map: ${error instanceof Error ? error.message : String(error)}`
      )
      return false
    }
  }

  @UseGuards(EditGuard)
  @SubscribeMessage('addNodes')
  async addNode(
    @ConnectedSocket() client: Socket,
    @MessageBody() request: unknown
  ): Promise<OperationResponse<IMmpClientNode[]>> {
    const validated = validateWsPayload(client, NodeAddRequestSchema, request)
    if (!validated) {
      return {
        success: false,
        errorType: 'critical',
        code: 'MALFORMED_REQUEST',
        message: 'CRITICAL_ERROR.MALFORMED_REQUEST',
      }
    }
    const h = this.getHelpers()
    try {
      const results = await this.mapsService.addNodesFromClient(
        validated.mapId,
        validated.nodes as IMmpClientNode[]
      )

      const processedResults = await h.processAddNodeResults(
        results,
        validated.mapId
      )

      if ('success' in processedResults) {
        return processedResults
      }

      if ('validationError' in processedResults) {
        const fullMapState = await h.safeExportMapToClient(validated.mapId)
        return {
          ...processedResults.validationError,
          fullMapState,
        } as OperationResponse<IMmpClientNode[]>
      }

      const { successfulNodes } = processedResults
      h.broadcastSuccessfulNodeAddition(
        validated.mapId,
        client.id,
        successfulNodes
      )

      const clientNodes = successfulNodes.map((node) =>
        mapMmpNodeToClient(node)
      )
      return h.buildSuccessResponse(clientNodes)
    } catch (error) {
      if (error instanceof QueryFailedError) {
        const mmpNode = mapClientNodeToMmpNode(
          validated.nodes[0] as IMmpClientNode,
          validated.mapId
        )
        return h.handleDatabaseConstraintError(
          error,
          mmpNode as MmpNode,
          validated.mapId
        )
      }

      return h.handleUnexpectedOperationError(
        error,
        validated.mapId,
        'Failed to add nodes'
      )
    }
  }

  @UseGuards(EditGuard)
  @SubscribeMessage('updateNode')
  async updateNode(
    @ConnectedSocket() client: Socket,
    @MessageBody() request: unknown
  ): Promise<OperationResponse<IMmpClientNode>> {
    const validated = validateWsPayload(client, NodeRequestSchema, request)
    if (!validated) {
      return {
        success: false,
        errorType: 'critical',
        code: 'MALFORMED_REQUEST',
        message: 'CRITICAL_ERROR.MALFORMED_REQUEST',
      }
    }
    const h = this.getHelpers()
    try {
      const updatedNode = await this.mapsService.updateNode(
        validated.mapId,
        validated.node as IMmpClientNode
      )

      const processedResult = await h.handleNodeUpdateResult(
        updatedNode ?? null,
        validated.mapId
      )

      if ('success' in processedResult) {
        return processedResult
      }

      const { validNode } = processedResult
      const clientNode = mapMmpNodeToClient(validNode)

      h.broadcastToRoom(validated.mapId, 'nodeUpdated', {
        clientId: client.id,
        property: validated.updatedProperty,
        node: clientNode,
      })

      return h.buildSuccessResponse(clientNode)
    } catch (error) {
      if (error instanceof QueryFailedError) {
        const mmpNode = mapClientNodeToMmpNode(
          validated.node as IMmpClientNode,
          validated.mapId
        )
        return h.handleDatabaseConstraintError(
          error,
          mmpNode as MmpNode,
          validated.mapId
        )
      }

      return h.handleUnexpectedOperationError(
        error,
        validated.mapId,
        'Failed to update node'
      )
    }
  }

  @UseGuards(EditGuard)
  @SubscribeMessage('applyMapChangesByDiff')
  async applyMapChangesByDiff(
    @ConnectedSocket() client: Socket,
    @MessageBody() request: unknown
  ): Promise<OperationResponse<IMmpClientMapDiff>> {
    const validated = validateWsPayload(client, UndoRedoRequestSchema, request)
    if (!validated) {
      return {
        success: false,
        errorType: 'critical',
        code: 'MALFORMED_REQUEST',
        message: 'CRITICAL_ERROR.MALFORMED_REQUEST',
      }
    }
    const h = this.getHelpers()
    try {
      if (!(await this.mapsService.findMap(validated.mapId))) {
        return h.buildErrorResponse(
          'critical',
          'MALFORMED_REQUEST',
          'CRITICAL_ERROR.MAP_NOT_FOUND',
          validated.mapId
        )
      }

      await this.mapsService.updateMapByDiff(validated.mapId, validated.diff)

      h.broadcastToRoom(validated.mapId, 'mapChangesUndoRedo', {
        clientId: client.id,
        diff: validated.diff,
      })

      return h.buildSuccessResponse(validated.diff)
    } catch (error) {
      return h.handleUnexpectedOperationError(
        error,
        validated.mapId,
        'Failed to apply map changes by diff'
      )
    }
  }

  @UseGuards(EditGuard)
  @SubscribeMessage('updateMap')
  async updateMap(
    @ConnectedSocket() client: Socket,
    @MessageBody() request: unknown
  ): Promise<boolean> {
    const validated = validateWsPayload(client, MapRequestSchema, request)
    if (!validated) return false
    const h = this.getHelpers()
    try {
      if (!(await this.mapsService.findMap(validated.mapId))) return false

      const mmpMap = {
        ...validated.map,
        uuid: validated.mapId,
      } as unknown as IMmpClientMap

      h.broadcastToRoom(mmpMap.uuid, 'clientNotification', {
        clientId: client.id,
        message: 'TOASTS.WARNINGS.MAP_IMPORT_IN_PROGRESS',
        type: 'warning',
      })

      const sockets = await this.disconnectAllClientsFromMap(validated.mapId)

      await this.mapsService.updateMap(mmpMap)

      this.reconnectClientsToMap(sockets, validated.mapId)

      const exportMap = await this.mapsService.exportMapToClient(mmpMap.uuid)

      if (exportMap) {
        h.broadcastToRoom(mmpMap.uuid, 'mapUpdated', {
          clientId: client.id,
          map: exportMap,
        })
      }

      h.broadcastToRoom(mmpMap.uuid, 'clientNotification', {
        clientId: client.id,
        message: 'TOASTS.MAP_IMPORT_SUCCESS',
        type: 'success',
      })

      return true
    } catch (error) {
      this.logger.error(
        `Failed to update map: ${error instanceof Error ? error.message : String(error)}`
      )
      return false
    }
  }

  @UseGuards(EditGuard)
  @SubscribeMessage('removeNode')
  async removeNode(
    @ConnectedSocket() client: Socket,
    @MessageBody() request: unknown
  ): Promise<OperationResponse<IMmpClientNode | null>> {
    const validated = validateWsPayload(
      client,
      NodeRemoveRequestSchema,
      request
    )
    if (!validated) {
      return {
        success: false,
        errorType: 'critical',
        code: 'MALFORMED_REQUEST',
        message: 'CRITICAL_ERROR.MALFORMED_REQUEST',
      }
    }
    const h = this.getHelpers()
    try {
      const removedNode = await this.mapsService.removeNode(
        validated.node as IMmpClientNode,
        validated.mapId
      )

      if (!removedNode) {
        return h.buildErrorResponse(
          'critical',
          'MALFORMED_REQUEST',
          'CRITICAL_ERROR.NODE_NOT_FOUND',
          validated.mapId
        )
      }

      h.broadcastToRoom(validated.mapId, 'nodeRemoved', {
        clientId: client.id,
        nodeId: validated.node.id,
      })

      return h.buildSuccessResponse(mapMmpNodeToClient(removedNode))
    } catch (error) {
      return h.handleUnexpectedOperationError(
        error,
        validated.mapId,
        'Failed to remove node'
      )
    }
  }

  @SubscribeMessage('updateNodeSelection')
  async updateNodeSelection(
    @ConnectedSocket() client: Socket,
    @MessageBody() request: unknown
  ): Promise<boolean> {
    const validated = validateWsPayload(client, NodeSelectionSchema, request)
    if (!validated) return false
    this.server.to(validated.mapId).emit('selectionUpdated', {
      clientId: client.id,
      nodeId: validated.nodeId,
      selected: validated.selected,
    })

    return true
  }

  // ============================================================
  // Client Cache Helpers
  // ============================================================

  private async updateClientCache(
    mapId: string,
    updateFn: (cache: IClientCache) => IClientCache
  ): Promise<IClientCache> {
    const currentCache: IClientCache =
      (await this.cacheManager.get(mapId)) || {}
    const updatedCache = updateFn(currentCache)
    await this.cacheManager.set(mapId, updatedCache, this.CACHE_TTL_MS)
    return updatedCache
  }

  private async addClientForMap(
    mapId: string,
    clientId: string,
    color: string
  ): Promise<IClientCache> {
    return this.updateClientCache(mapId, (cache) => ({
      ...cache,
      [clientId]: this.chooseColor(cache, color),
    }))
  }

  private async removeClientForMap(
    mapId: string,
    clientId: string
  ): Promise<IClientCache> {
    return this.updateClientCache(mapId, (cache) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { [clientId]: _, ...rest } = cache
      return rest
    })
  }

  private chooseColor(currentClientCache: IClientCache, color: string): string {
    const usedColors: string[] = Object.values(currentClientCache)
    if (usedColors.includes(color)) return `#${randomBytes(3).toString('hex')}`

    return color
  }

  // ============================================================
  // Room Management Helpers
  // ============================================================

  private async disconnectAllClientsFromMap(mapId: string) {
    const sockets = await this.server.in(mapId).fetchSockets()
    this.server.in(mapId).socketsLeave(mapId)
    return sockets
  }

  private reconnectClientsToMap(
    sockets: Awaited<ReturnType<typeof this.disconnectAllClientsFromMap>>,
    mapId: string
  ): void {
    sockets.forEach((socket) => {
      socket.join(mapId)
    })
  }

  private async setupClientRoomMembership(
    client: Socket,
    mapId: string,
    color: string
  ): Promise<IClientCache> {
    client.join(mapId)
    await this.cacheManager.set(client.id, mapId, this.CACHE_TTL_MS)
    return await this.addClientForMap(mapId, client.id, color)
  }
}
