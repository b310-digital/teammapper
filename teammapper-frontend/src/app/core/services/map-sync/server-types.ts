import { MapSnapshot, ExportNodeProperties } from '@mmp/map/types';
import { CachedMapOptions } from 'src/app/shared/models/cached-map.model';

// Re-export operation types from backend
export type OperationType =
  | 'create'
  | 'update'
  | 'delete'
  | 'updateProperty'
  | 'undo'
  | 'redo';
export type OperationStatus = 'pending' | 'confirmed' | 'rejected';

// Error response types (matching backend types.ts)
export interface BaseErrorResponse {
  success: false;
  errorType: 'validation' | 'critical';
  code: string;
  message: string;
  context?: Record<string, unknown>;
}

export interface ValidationErrorResponse extends BaseErrorResponse {
  errorType: 'validation';
  code:
    | 'INVALID_PARENT'
    | 'CONSTRAINT_VIOLATION'
    | 'MISSING_REQUIRED_FIELD'
    | 'CIRCULAR_REFERENCE'
    | 'DUPLICATE_NODE';
  fullMapState?: ServerMap;
}

export interface CriticalErrorResponse extends BaseErrorResponse {
  errorType: 'critical';
  code:
    | 'SERVER_ERROR'
    | 'NETWORK_TIMEOUT'
    | 'AUTH_FAILED'
    | 'MALFORMED_REQUEST'
    | 'RATE_LIMIT_EXCEEDED';
  retryAfter?: number;
  fullMapState?: ServerMap;
}

export interface SuccessResponse<T = unknown> {
  success: true;
  data: T;
  meta?: {
    timestamp: number;
    operationId?: string;
  };
}

export type OperationResponse<T = unknown> =
  | SuccessResponse<T>
  | ValidationErrorResponse
  | CriticalErrorResponse;

// Extended node properties with optimistic state
export interface ExportNodePropertiesWithState extends ExportNodeProperties {
  __optimistic?: boolean;
  __operationId?: string;
  __localModifiedAt?: number;
}

interface ResponseServer {
  // socket id of the triggering client, to prevent endless update loops
  clientId: string;
}

interface ResponseMapUpdated extends ResponseServer {
  map: ServerMap;
}

type ResponseSnapshotChanges = Record<
  string,
  Partial<ExportNodeProperties> | undefined
>;

interface ResponseMapDiff {
  added: ResponseSnapshotChanges;
  deleted: ResponseSnapshotChanges;
  updated: ResponseSnapshotChanges;
}

interface ResponseUndoRedoChanges extends ResponseServer {
  diff: ResponseMapDiff;
}

interface ResponseMapOptionsUpdated extends ResponseServer {
  options: CachedMapOptions;
}

interface ResponseNodeUpdated extends ResponseServer {
  node: ExportNodeProperties;
  property: string;
}

interface ResponseNodesAdded extends ResponseServer {
  nodes: ExportNodeProperties[];
}

interface ResponseClientNotification {
  clientId: string;
  message: string;
  type: 'error' | 'warning' | 'success';
}

interface ResponseNodeRemoved extends ResponseServer {
  nodeId: string;
}

interface ResponseSelectionUpdated extends ResponseServer {
  nodeId: string;
  selected: boolean;
}

interface ServerMap {
  uuid: string;
  lastModified: string;
  deletedAt: string;
  deleteAfterDays: number;
  data: MapSnapshot;
  options: CachedMapOptions;
  createdAt: string;
  writable?: boolean;
}

interface PrivateServerMap {
  map: ServerMap;
  adminId: string;
  modificationSecret: string;
}

interface ServerMapInfo {
  uuid: string;
  adminId: string | null;
  modificationSecret: string | null;
  ttl: string | null;
  rootName: string | null;
}

const ReversePropertyMapping = {
  name: 'name',
  locked: 'locked',
  coordinates: 'coordinates',
  image: {
    src: 'imageSrc',
    size: 'imageSize',
  },
  link: {
    href: 'linkHref',
  },
  colors: {
    background: 'backgroundColor',
    branch: 'branchColor',
    name: 'nameColor',
  },
  font: {
    weight: 'fontWeight',
    style: 'fontStyle',
    size: 'fontSize',
  },
  hidden: 'hidden',
} as const;

export {
  ResponseMapUpdated,
  ResponseUndoRedoChanges,
  ResponseMapOptionsUpdated,
  ResponseNodesAdded,
  ResponseNodeRemoved,
  ResponseNodeUpdated,
  ResponseSelectionUpdated,
  ResponseClientNotification,
  ServerMap,
  ServerMapInfo,
  PrivateServerMap,
  ReversePropertyMapping,
};
