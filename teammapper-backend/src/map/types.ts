import type { IMmpClientNode as _IMmpClientNode } from './schemas/node.schema'
import type { IMmpClientMapOptions as _IMmpClientMapOptions } from './schemas/gateway.schema'

// Entity/node types — derived from valibot schemas
export type {
  IMmpClientColor,
  IMmpClientCoordinates,
  IMmpClientFont,
  IMmpClientNodeBasics,
  IMmpClientNode,
} from './schemas/node.schema'

// Gateway/request types — derived from valibot schemas
export type {
  IMmpClientJoinRequest,
  IMmpClientEditingRequest,
  IMmpClientNodeRequest,
  IMmpClientNodeAddRequest,
  IMmpClientNodeSelectionRequest,
  IMmpClientUpdateMapOptionsRequest,
  IMmpClientMapOptions,
  IMmpClientMapRequest,
  IMmpClientUndoRedoRequest,
  IMmpClientDeleteRequest,
  IMmpClientSnapshotChanges,
  IMmpClientMapDiff,
} from './schemas/gateway.schema'

// Maps controller types — derived from valibot schemas
export type { IMmpClientMapCreateRequest } from './schemas/maps.schema'

// IMmpClientMap is a domain type used across services/mappers with required fields.
// The WebSocket MapSchema is intentionally permissive for validation; this interface
// is the canonical type for internal use.
export interface IMmpClientMap {
  uuid: string
  lastModified: Date | null
  lastAccessed: Date | null
  deleteAfterDays: number
  deletedAt: Date
  data: _IMmpClientNode[]
  options: _IMmpClientMapOptions
  createdAt: Date | null
  writable?: boolean
}

// Types that don't have schemas (not user input boundaries)

export interface MapOptions {
  fontIncrement: number
  fontMaxSize: number
  fontMinSize: number
}

export interface IMmpClientMapInfo {
  uuid: string
  adminId: string | null
  modificationSecret: string | null
  ttl: Date | undefined
  rootName: string | null
}

export interface IMmpClientPrivateMap {
  map: IMmpClientMap
  adminId: string | null
  modificationSecret: string | null
}

export interface IClientCache {
  [clientId: string]: string
}

// Operation tracking types for optimistic updates
export type OperationType = 'create' | 'update' | 'delete' | 'updateProperty'

export type OperationStatus = 'pending' | 'confirmed' | 'rejected' | 'timedout'

// Error response types for structured error handling
export interface BaseErrorResponse {
  /** Success indicator (always false for errors) */
  success: false

  /** Type of error for classification */
  errorType: 'validation' | 'critical'

  /** Machine-readable error code */
  code: string

  /** i18n key for user-facing message */
  message: string

  /** Optional additional context (not shown to user) */
  context?: Record<string, unknown>
}

export interface ValidationErrorResponse extends BaseErrorResponse {
  errorType: 'validation'

  /** Specific validation error codes */
  code:
    | 'INVALID_PARENT'
    | 'CONSTRAINT_VIOLATION'
    | 'MISSING_REQUIRED_FIELD'
    | 'CIRCULAR_REFERENCE'
    | 'DUPLICATE_NODE'

  /** Full map state for client synchronization after errors */
  fullMapState?: IMmpClientMap
}

export interface CriticalErrorResponse extends BaseErrorResponse {
  errorType: 'critical'

  /** Specific critical error codes */
  code:
    | 'SERVER_ERROR'
    | 'NETWORK_TIMEOUT'
    | 'AUTH_FAILED'
    | 'MALFORMED_REQUEST'
    | 'RATE_LIMIT_EXCEEDED'

  /** Optional retry-after value for rate limiting */
  retryAfter?: number

  /** Full map state for client synchronization after errors */
  fullMapState?: IMmpClientMap
}

export interface SuccessResponse<T = unknown> {
  /** Success indicator */
  success: true

  /** Result data from the operation */
  data: T

  /** Optional metadata */
  meta?: {
    timestamp: number
    operationId?: string
  }
}

export interface Request {
  cookies: {
    access_token?: string
    person_id?: string
  }
  pid: string | undefined
}

export type OperationResponse<T = unknown> =
  | SuccessResponse<T>
  | ValidationErrorResponse
  | CriticalErrorResponse
