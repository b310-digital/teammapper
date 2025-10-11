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
import { MmpMap } from '../entities/mmpMap.entity'
import { MmpNode } from '../entities/mmpNode.entity'
import { EditGuard } from '../guards/edit.guard'
import { MapsService } from '../services/maps.service'
import {
  IClientCache,
  IMmpClientDeleteRequest,
  IMmpClientEditingRequest,
  IMmpClientJoinRequest,
  IMmpClientMap,
  IMmpClientMapDiff,
  IMmpClientMapRequest,
  IMmpClientNode,
  IMmpClientNodeAddRequest,
  IMmpClientNodeRequest,
  IMmpClientNodeSelectionRequest,
  IMmpClientUndoRedoRequest,
  IMmpClientUpdateMapOptionsRequest,
  OperationResponse,
  ValidationErrorResponse,
} from '../types'
import {
  mapClientNodeToMmpNode,
  mapMmpNodeToClient,
} from '../utils/clientServerMapping'

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
    try {
      const map = await this.mapsService.findMap(request.mapId)
      if (!map) {
        this.logger.warn(
          `onJoin(): Could not find map ${request.mapId} when client ${client.id} tried to join`
        )
        return
      }

      const updatedClientCache = await this.setupClientRoomMembership(
        client,
        request.mapId,
        request.color
      )

      this.server
        .to(request.mapId)
        .emit('clientListUpdated', updatedClientCache)

      return await this.mapsService.exportMapToClient(request.mapId)
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
    @MessageBody() request: IMmpClientEditingRequest
  ): Promise<boolean> {
    try {
      const map = await this.mapsService.findMap(request.mapId)
      if (!map || !map.modificationSecret) return true

      return request.modificationSecret === map?.modificationSecret
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
    try {
      const mmpMap: MmpMap | null = await this.mapsService.findMap(
        request.mapId
      )
      if (mmpMap && mmpMap.adminId === request.adminId) {
        this.mapsService.deleteMap(request.mapId)
        this.server.to(request.mapId).emit('mapDeleted')
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
    @MessageBody() request: IMmpClientNodeAddRequest
  ): Promise<OperationResponse<IMmpClientNode[]>> {
    try {
      const results = await this.mapsService.addNodesFromClient(
        request.mapId,
        request.nodes
      )

      const processedResults = await this.processAddNodeResults(
        results,
        request.mapId
      )

      if ('success' in processedResults) {
        return processedResults
      }

      if ('validationError' in processedResults) {
        const fullMapState = await this.safeExportMapToClient(request.mapId)
        return {
          ...processedResults.validationError,
          fullMapState,
        } as OperationResponse<IMmpClientNode[]>
      }

      const { successfulNodes } = processedResults
      this.broadcastSuccessfulNodeAddition(
        request.mapId,
        client.id,
        successfulNodes
      )

      const clientNodes = successfulNodes.map((node) =>
        mapMmpNodeToClient(node)
      )
      return this.buildSuccessResponse(clientNodes)
    } catch (error) {
      if (error instanceof QueryFailedError) {
        const mmpNode = mapClientNodeToMmpNode(request.nodes[0], request.mapId)
        return this.handleDatabaseConstraintError(
          error,
          mmpNode as MmpNode,
          request.mapId
        )
      }

      return this.handleUnexpectedOperationError(
        error,
        request.mapId,
        'Failed to add nodes'
      )
    }
  }

  @UseGuards(EditGuard)
  @SubscribeMessage('updateNode')
  async updateNode(
    @ConnectedSocket() client: Socket,
    @MessageBody() request: IMmpClientNodeRequest
  ): Promise<OperationResponse<IMmpClientNode>> {
    try {
      if (!request.node) {
        return this.buildValidationErrorResponse(
          'MISSING_REQUIRED_FIELD',
          'VALIDATION_ERROR.MISSING_REQUIRED_FIELD',
          request.mapId
        )
      }

      const updatedNode = await this.executeNodeUpdateOperation(
        request.mapId,
        request.node
      )

      const processedResult = await this.handleNodeUpdateResult(
        updatedNode,
        request.mapId
      )

      if ('success' in processedResult) {
        return processedResult
      }

      const { validNode } = processedResult
      const clientNode = mapMmpNodeToClient(validNode)

      this.broadcastNodeUpdatedToRoom(
        request.mapId,
        client.id,
        clientNode,
        request.updatedProperty
      )

      return this.buildSuccessResponse(clientNode)
    } catch (error) {
      if (error instanceof QueryFailedError) {
        const mmpNode = mapClientNodeToMmpNode(request.node, request.mapId)
        return this.handleDatabaseConstraintError(
          error,
          mmpNode as MmpNode,
          request.mapId
        )
      }

      return this.handleUnexpectedOperationError(
        error,
        request.mapId,
        'Failed to update node'
      )
    }
  }

  @UseGuards(EditGuard)
  @SubscribeMessage('applyMapChangesByDiff')
  async applyMapChangesByDiff(
    @ConnectedSocket() client: Socket,
    @MessageBody() request: IMmpClientUndoRedoRequest
  ): Promise<OperationResponse<IMmpClientMapDiff>> {
    try {
      if (!(await this.mapsService.findMap(request.mapId))) {
        return this.buildCriticalErrorResponse(
          'MALFORMED_REQUEST',
          'CRITICAL_ERROR.MAP_NOT_FOUND',
          request.mapId
        )
      }

      if (!request.diff) {
        return this.buildCriticalErrorResponse(
          'MALFORMED_REQUEST',
          'CRITICAL_ERROR.MISSING_REQUIRED_FIELD',
          request.mapId
        )
      }

      await this.mapsService.updateMapByDiff(request.mapId, request.diff)

      this.broadcastMapDiffChangesToRoom(request.mapId, client.id, request.diff)

      return this.buildSuccessResponse(request.diff)
    } catch (error) {
      return this.handleUnexpectedOperationError(
        error,
        request.mapId,
        'Failed to apply map changes by diff'
      )
    }
  }

  @UseGuards(EditGuard)
  @SubscribeMessage('updateMap')
  async updateMap(
    @ConnectedSocket() client: Socket,
    @MessageBody() request: IMmpClientMapRequest
  ): Promise<boolean> {
    try {
      if (!(await this.mapsService.findMap(request.mapId))) return false

      const mmpMap: IMmpClientMap = request.map

      this.broadcastNotificationToRoom(
        mmpMap.uuid,
        client.id,
        'TOASTS.WARNINGS.MAP_IMPORT_IN_PROGRESS',
        'warning'
      )

      const sockets = await this.disconnectAllClientsFromMap(request.mapId)

      await this.mapsService.updateMap(mmpMap)

      this.reconnectClientsToMap(sockets, request.mapId)

      const exportMap = await this.mapsService.exportMapToClient(mmpMap.uuid)

      if (exportMap) {
        this.broadcastFullMapUpdate(mmpMap.uuid, client.id, exportMap)
      }

      this.broadcastNotificationToRoom(
        mmpMap.uuid,
        client.id,
        'TOASTS.MAP_IMPORT_SUCCESS',
        'success'
      )

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
    @MessageBody() request: IMmpClientNodeRequest
  ): Promise<OperationResponse<IMmpClientNode | null>> {
    try {
      if (!this.hasRequiredNodeFields(request.node)) {
        return this.buildCriticalErrorResponse(
          'MALFORMED_REQUEST',
          'CRITICAL_ERROR.MISSING_REQUIRED_FIELD',
          request.mapId
        )
      }

      const removedNode = await this.executeNodeRemovalOperation(
        request.node,
        request.mapId
      )

      if (!removedNode) {
        return this.buildCriticalErrorResponse(
          'MALFORMED_REQUEST',
          'CRITICAL_ERROR.NODE_NOT_FOUND',
          request.mapId
        )
      }

      this.broadcastNodeRemovedToRoom(request.mapId, client.id, request.node.id)

      return this.buildSuccessResponse(mapMmpNodeToClient(removedNode))
    } catch (error) {
      return this.handleUnexpectedOperationError(
        error,
        request.mapId,
        'Failed to remove node'
      )
    }
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

  /**
   * Safely exports map to client with error handling
   * Returns undefined if export fails (e.g., database unavailable)
   */
  private async safeExportMapToClient(
    mapId: string
  ): Promise<IMmpClientMap | undefined> {
    try {
      return await this.mapsService.exportMapToClient(mapId)
    } catch (exportError) {
      this.logger.error(
        `Failed to export map state for error recovery: ${exportError instanceof Error ? exportError.message : String(exportError)}`
      )
      return undefined
    }
  }

  // ============================================================
  // Error Handling Helpers
  // ============================================================

  /**
   * Creates a validation error response with full map state for client recovery
   */
  private async buildValidationErrorResponse<T>(
    code:
      | 'INVALID_PARENT'
      | 'CONSTRAINT_VIOLATION'
      | 'MISSING_REQUIRED_FIELD'
      | 'CIRCULAR_REFERENCE'
      | 'DUPLICATE_NODE',
    message: string,
    mapId: string
  ): Promise<OperationResponse<T>> {
    const fullMapState = await this.safeExportMapToClient(mapId)
    return {
      success: false,
      errorType: 'validation',
      code,
      message,
      fullMapState,
    }
  }

  /**
   * Creates a critical error response with full map state for client recovery
   */
  private async buildCriticalErrorResponse<T>(
    code:
      | 'SERVER_ERROR'
      | 'NETWORK_TIMEOUT'
      | 'AUTH_FAILED'
      | 'MALFORMED_REQUEST'
      | 'RATE_LIMIT_EXCEEDED',
    message: string,
    mapId: string
  ): Promise<OperationResponse<T>> {
    const fullMapState = await this.safeExportMapToClient(mapId)
    return {
      success: false,
      errorType: 'critical',
      code,
      message,
      fullMapState,
    }
  }

  /**
   * Handles database constraint errors and converts them to validation responses
   */
  private async handleDatabaseConstraintError<T>(
    error: QueryFailedError,
    node: MmpNode,
    mapId: string
  ): Promise<OperationResponse<T>> {
    const validationResponse =
      await this.mapsService.mapConstraintErrorToValidationResponse(
        error,
        node,
        mapId
      )
    const fullMapState = await this.safeExportMapToClient(mapId)
    return {
      ...validationResponse,
      fullMapState,
    } as OperationResponse<T>
  }

  /**
   * Handles unexpected errors during operations and creates appropriate error response
   */
  private async handleUnexpectedOperationError<T>(
    error: unknown,
    mapId: string,
    operationContext: string
  ): Promise<OperationResponse<T>> {
    this.logger.error(
      `${operationContext}: ${error instanceof Error ? error.message : String(error)}`
    )
    return this.buildCriticalErrorResponse(
      'SERVER_ERROR',
      'CRITICAL_ERROR.SERVER_UNAVAILABLE',
      mapId
    )
  }

  // ============================================================
  // Response Building Helpers
  // ============================================================

  /**
   * Creates a successful operation response with data
   */
  private buildSuccessResponse<T>(data: T): OperationResponse<T> {
    return {
      success: true,
      data,
    }
  }

  /**
   * Extracts validation errors from a mixed array of results
   */
  private extractValidationErrors(
    results: (MmpNode | ValidationErrorResponse)[]
  ): ValidationErrorResponse[] {
    return results.filter(
      (r) => 'errorType' in r && r.errorType === 'validation'
    ) as ValidationErrorResponse[]
  }

  /**
   * Checks if a result is a validation error response
   */
  private isValidationError(
    result: MmpNode | ValidationErrorResponse
  ): result is ValidationErrorResponse {
    return 'errorType' in result && result.errorType === 'validation'
  }

  // ============================================================
  // Broadcasting Helpers
  // ============================================================

  /**
   * Broadcasts added nodes to all clients in the map room
   */
  private broadcastNodesAddedToRoom(
    mapId: string,
    clientId: string,
    nodes: IMmpClientNode[]
  ): void {
    this.server.to(mapId).emit('nodesAdded', {
      clientId,
      nodes,
    })
  }

  /**
   * Broadcasts updated node to all clients in the map room
   */
  private broadcastNodeUpdatedToRoom(
    mapId: string,
    clientId: string,
    node: IMmpClientNode,
    updatedProperty?: string
  ): void {
    this.server.to(mapId).emit('nodeUpdated', {
      clientId,
      property: updatedProperty,
      node,
    })
  }

  /**
   * Broadcasts removed node to all clients in the map room
   */
  private broadcastNodeRemovedToRoom(
    mapId: string,
    clientId: string,
    nodeId: string
  ): void {
    this.server.to(mapId).emit('nodeRemoved', {
      clientId,
      nodeId,
    })
  }

  /**
   * Broadcasts map changes from undo/redo operation to all clients
   */
  private broadcastMapDiffChangesToRoom(
    mapId: string,
    clientId: string,
    diff: IMmpClientMapDiff
  ): void {
    this.server.to(mapId).emit('mapChangesUndoRedo', {
      clientId,
      diff,
    })
  }

  /**
   * Broadcasts node selection update to all clients in the map room
   */
  private broadcastNodeSelectionUpdate(
    mapId: string,
    clientId: string,
    nodeId: string,
    selected: boolean
  ): void {
    this.server.to(mapId).emit('selectionUpdated', {
      clientId,
      nodeId,
      selected,
    })
  }

  /**
   * Broadcasts notification message to all clients in the map room
   */
  private broadcastNotificationToRoom(
    mapId: string,
    clientId: string,
    message: string,
    type: 'info' | 'warning' | 'success' | 'error'
  ): void {
    this.server.to(mapId).emit('clientNotification', {
      clientId,
      message,
      type,
    })
  }

  /**
   * Broadcasts full map update to all clients in the map room
   */
  private broadcastFullMapUpdate(
    mapId: string,
    clientId: string,
    map: IMmpClientMap
  ): void {
    this.server.to(mapId).emit('mapUpdated', {
      clientId,
      map,
    })
  }

  // ============================================================
  // AddNode Operation Helpers
  // ============================================================

  /**
   * Processes results from adding nodes (atomic operation)
   * Returns appropriate response - either all nodes succeeded or operation failed
   */
  private async processAddNodeResults(
    results: (MmpNode | ValidationErrorResponse)[] | null,
    mapId: string
  ): Promise<
    | OperationResponse<IMmpClientNode[]>
    | { validationError: ValidationErrorResponse }
    | { successfulNodes: MmpNode[] }
  > {
    if (!results || results.length === 0) {
      return this.buildValidationErrorResponse(
        'CONSTRAINT_VIOLATION',
        'VALIDATION_ERROR.CONSTRAINT_VIOLATION',
        mapId
      )
    }

    // Check if the result is a single validation error (atomic failure)
    if (results.length === 1 && this.isValidationError(results[0])) {
      return { validationError: results[0] }
    }

    // All results are successful MmpNodes (atomic success)
    return { successfulNodes: results as MmpNode[] }
  }

  /**
   * Handles successful node addition by broadcasting and updating selection
   */
  private broadcastSuccessfulNodeAddition(
    mapId: string,
    clientId: string,
    nodes: MmpNode[]
  ): void {
    const clientNodes = nodes.map((node) => mapMmpNodeToClient(node))
    this.broadcastNodesAddedToRoom(mapId, clientId, clientNodes)

    if (nodes.length === 1 && nodes[0]?.id) {
      this.broadcastNodeSelectionUpdate(mapId, clientId, nodes[0].id, true)
    }
  }

  // ============================================================
  // UpdateNode Operation Helpers
  // ============================================================

  /**
   * Validates and executes node update operation
   */
  private async executeNodeUpdateOperation(
    mapId: string,
    node: IMmpClientNode
  ): Promise<MmpNode | ValidationErrorResponse | null> {
    const result = await this.mapsService.updateNode(mapId, node)
    return result ?? null
  }

  /**
   * Processes the result of a node update operation
   */
  private async handleNodeUpdateResult(
    result: MmpNode | ValidationErrorResponse | null,
    mapId: string
  ): Promise<OperationResponse<IMmpClientNode> | { validNode: MmpNode }> {
    if (!result) {
      return this.buildValidationErrorResponse(
        'INVALID_PARENT',
        'VALIDATION_ERROR.INVALID_PARENT',
        mapId
      )
    }

    if (this.isValidationError(result)) {
      return {
        ...result,
        fullMapState: await this.safeExportMapToClient(mapId),
      }
    }

    return { validNode: result as MmpNode }
  }

  // ============================================================
  // RemoveNode Operation Helpers
  // ============================================================

  /**
   * Validates node removal request has required fields
   */
  private hasRequiredNodeFields(
    node: IMmpClientNode | undefined
  ): node is IMmpClientNode & { id: string } {
    return !!node && !!node.id
  }

  /**
   * Executes node removal and returns the removed node or undefined
   */
  private async executeNodeRemovalOperation(
    node: IMmpClientNode,
    mapId: string
  ): Promise<MmpNode | undefined> {
    return await this.mapsService.removeNode(node, mapId)
  }

  // ============================================================
  // UpdateMap Operation Helpers
  // ============================================================

  /**
   * Temporarily disconnects all clients from a map room before major update
   */
  private async disconnectAllClientsFromMap(mapId: string) {
    const sockets = await this.server.in(mapId).fetchSockets()
    this.server.in(mapId).socketsLeave(mapId)
    return sockets
  }

  /**
   * Reconnects previously disconnected clients back to the map room
   */
  private reconnectClientsToMap(
    sockets: Awaited<ReturnType<typeof this.disconnectAllClientsFromMap>>,
    mapId: string
  ): void {
    sockets.forEach((socket) => {
      socket.join(mapId)
    })
  }

  // ============================================================
  // OnJoin Operation Helpers
  // ============================================================

  /**
   * Sets up client room membership and updates cache
   */
  private async setupClientRoomMembership(
    client: Socket,
    mapId: string,
    color: string
  ): Promise<IClientCache> {
    client.join(mapId)
    this.cacheManager.set(client.id, mapId, 10000)
    return await this.addClientForMap(mapId, client.id, color)
  }
}
