export type {
  ClientMap as IMmpClientMap,
  ClientMapInfo as IMmpClientMapInfo,
  ClientPrivateMap as IMmpClientPrivateMap,
  IMmpClientNode,
  IMmpClientNodeBasics,
  MapOptions,
} from '@teammapper/shared'
export interface Request {
  cookies: {
    access_token?: string
    person_id?: string
  }
  pid: string | undefined
}
