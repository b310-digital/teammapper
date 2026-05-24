import type { IMmpClientNode as _IMmpClientNode } from './schemas/node.schema'
import type { IMmpClientMapOptions as _IMmpClientMapOptions } from './schemas/maps.schema'

// Entity/node types — derived from valibot schemas
export type {
  IMmpClientColor,
  IMmpClientCoordinates,
  IMmpClientFont,
  IMmpClientNodeBasics,
  IMmpClientNode,
} from './schemas/node.schema'

// Maps controller types — derived from valibot schemas
export type {
  IMmpClientMapOptions,
  IMmpClientMapCreateRequest,
  IMmpClientDeleteRequest,
} from './schemas/maps.schema'

// IMmpClientMap is the canonical domain type used across services/mappers.
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

export interface Request {
  cookies: {
    access_token?: string
    person_id?: string
  }
  pid: string | undefined
}
