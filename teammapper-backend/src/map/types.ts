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

import type {
  ClientMap,
  ClientMapInfo,
  ClientPrivateMap,
  MapOptions as _SharedMapOptions,
} from '@teammapper/shared'

// Canonical domain types consolidated in @teammapper/shared
export type IMmpClientMap = ClientMap
export type MapOptions = _SharedMapOptions
export type IMmpClientMapInfo = ClientMapInfo
export type IMmpClientPrivateMap = ClientPrivateMap

export interface Request {
  cookies: {
    access_token?: string
    person_id?: string
  }
  pid: string | undefined
}
