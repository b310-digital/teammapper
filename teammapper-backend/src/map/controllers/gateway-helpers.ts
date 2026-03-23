import { Logger } from '@nestjs/common'
import { Server } from 'socket.io'
import { QueryFailedError } from 'typeorm'
import { MmpNode } from '../entities/mmpNode.entity'
import { MapsService } from '../services/maps.service'
import {
  IMmpClientMap,
  IMmpClientNode,
  OperationResponse,
  ValidationErrorResponse,
} from '../types'
import { mapMmpNodeToClient } from '../utils/clientServerMapping'

export class GatewayHelpers {
  constructor(
    private readonly server: Server,
    private readonly mapsService: MapsService,
    private readonly logger: Logger
  ) {}

  async safeExportMapToClient(
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

  async buildErrorResponse<T>(
    errorType: 'validation',
    code:
      | 'INVALID_PARENT'
      | 'CONSTRAINT_VIOLATION'
      | 'MISSING_REQUIRED_FIELD'
      | 'CIRCULAR_REFERENCE'
      | 'DUPLICATE_NODE',
    message: string,
    mapId: string
  ): Promise<OperationResponse<T>>

  async buildErrorResponse<T>(
    errorType: 'critical',
    code:
      | 'SERVER_ERROR'
      | 'NETWORK_TIMEOUT'
      | 'AUTH_FAILED'
      | 'MALFORMED_REQUEST'
      | 'RATE_LIMIT_EXCEEDED',
    message: string,
    mapId: string
  ): Promise<OperationResponse<T>>

  async buildErrorResponse<T>(
    errorType: 'validation' | 'critical',
    code: string,
    message: string,
    mapId: string
  ): Promise<OperationResponse<T>> {
    const fullMapState = await this.safeExportMapToClient(mapId)
    return {
      success: false,
      errorType,
      code,
      message,
      fullMapState,
    } as OperationResponse<T>
  }

  async handleDatabaseConstraintError<T>(
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

  async handleUnexpectedOperationError<T>(
    error: unknown,
    mapId: string,
    operationContext: string
  ): Promise<OperationResponse<T>> {
    this.logger.error(
      `${operationContext}: ${error instanceof Error ? error.message : String(error)}`
    )
    return this.buildErrorResponse(
      'critical',
      'SERVER_ERROR',
      'CRITICAL_ERROR.SERVER_UNAVAILABLE',
      mapId
    )
  }

  buildSuccessResponse<T>(data: T): OperationResponse<T> {
    return { success: true, data }
  }

  isValidationError(
    result: MmpNode | ValidationErrorResponse
  ): result is ValidationErrorResponse {
    return 'errorType' in result && result.errorType === 'validation'
  }

  broadcastToRoom<T extends Record<string, unknown>>(
    mapId: string,
    eventName: string,
    payload: T
  ): void {
    this.server.to(mapId).emit(eventName, payload)
  }

  async processAddNodeResults(
    results: (MmpNode | ValidationErrorResponse)[] | null,
    mapId: string
  ): Promise<
    | OperationResponse<IMmpClientNode[]>
    | { validationError: ValidationErrorResponse }
    | { successfulNodes: MmpNode[] }
  > {
    if (!results || results.length === 0) {
      return this.buildErrorResponse(
        'validation',
        'CONSTRAINT_VIOLATION',
        'VALIDATION_ERROR.CONSTRAINT_VIOLATION',
        mapId
      )
    }

    if (results.length === 1 && this.isValidationError(results[0])) {
      return { validationError: results[0] }
    }

    return { successfulNodes: results as MmpNode[] }
  }

  broadcastSuccessfulNodeAddition(
    mapId: string,
    clientId: string,
    nodes: MmpNode[]
  ): void {
    const clientNodes = nodes.map((node) => mapMmpNodeToClient(node))
    this.broadcastToRoom(mapId, 'nodesAdded', { clientId, nodes: clientNodes })

    if (nodes.length === 1 && nodes[0]?.id) {
      this.broadcastToRoom(mapId, 'selectionUpdated', {
        clientId,
        nodeId: nodes[0].id,
        selected: true,
      })
    }
  }

  async handleNodeUpdateResult(
    result: MmpNode | ValidationErrorResponse | null,
    mapId: string
  ): Promise<OperationResponse<IMmpClientNode> | { validNode: MmpNode }> {
    if (!result) {
      return this.buildErrorResponse(
        'validation',
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
}
