export interface MapOptions {
  fontIncrement: number
  fontMaxSize: number
  fontMinSize: number
}

export interface IMmpClientColor {
  name: string | null
  background: string | null
  branch: string | null
}

export interface IMmpClientCoordinates {
  x: number
  y: number
}

export interface IMmpClientFont {
  style: string | null
  size: number | null
  weight: string | null
}

export interface IMmpClientMap {
  uuid: string
  lastModified: Date | null
  lastAccessed: Date | null
  deleteAfterDays: number
  deletedAt: Date
  data: IMmpClientNode[]
  options: IMmpClientMapOptions
  createdAt: Date | null
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

export interface IMmpClientNodeBasics {
  colors: IMmpClientColor
  font: IMmpClientFont
  name: string | null
  image: { src: string | null; size: number | null }
}

export interface IMmpClientNode extends IMmpClientNodeBasics {
  coordinates: IMmpClientCoordinates
  detached: boolean
  id: string
  k: number
  link: { href: string | null }
  locked: boolean
  parent: string | null
  isRoot: boolean
}

export interface IMmpClientMapOptions {
  fontMaxSize: number
  fontMinSize: number
  fontIncrement: number
}

export interface IClientCache {
  [clientId: string]: string
}

export interface IMmpClientJoinRequest {
  mapId: string
  color: string
}

export interface IMmpClientNodeSelectionRequest {
  mapId: string
  nodeId: string
  selected: boolean
}

export interface IMmpClientEditingRequest {
  modificationSecret: string
  mapId: string
}

export interface IMmpClientNodeRequest extends IMmpClientEditingRequest {
  node: IMmpClientNode
  updatedProperty: string
}

export interface IMmpClientNodeAddRequest extends IMmpClientEditingRequest {
  nodes: IMmpClientNode[]
}

export interface IMmpClientUpdateMapOptionsRequest
  extends IMmpClientEditingRequest {
  options: IMmpClientMapOptions
}

export interface IMmpClientSnapshotChanges {
  [k: string]: Partial<IMmpClientNode> | undefined
}

export interface IMmpClientMapDiff {
  added: IMmpClientSnapshotChanges
  deleted: IMmpClientSnapshotChanges
  updated: IMmpClientSnapshotChanges
}

export interface IMmpClientMapRequest extends IMmpClientEditingRequest {
  map: IMmpClientMap
}

export interface IMmpClientUndoRedoRequest extends IMmpClientEditingRequest {
  diff: IMmpClientMapDiff
}

export interface IMmpClientMapCreateRequest {
  rootNode: IMmpClientNodeBasics
}

export interface IMmpClientDeleteRequest {
  adminId: string | null
  mapId: string
}

export interface IMermaidCreateRequest {
  mindmapDescription: string
  language: string
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
