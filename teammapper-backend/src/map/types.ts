export interface MapOptions {
  fontIncrement: number
  fontMaxSize: number
  fontMinSize: number
}

export interface IMmpClientColor {
  name: string
  background: string
  branch: string
}

export interface IMmpClientCoordinates {
  x: number
  y: number
}

export interface IMmpClientFont {
  style: string
  size: number
  weight: string
}

export interface IMmpClientMap {
  uuid: string
  lastModified: Date
  lastAccessed: Date
  deleteAfterDays: number
  deletedAt: Date
  data: IMmpClientNode[]
  options: IMmpClientMapOptions,
  createdAt: Date
}

export interface IMmpClientPrivateMap {
  map: IMmpClientMap
  adminId: string
  modificationSecret: string
}

export interface IMmpClientNodeBasics {
  colors: IMmpClientColor
  font: IMmpClientFont
  name: string
  image: { src: string; size: number }
}

export interface IMmpClientNode extends IMmpClientNodeBasics {
  coordinates: IMmpClientCoordinates
  detached: boolean
  id: string
  k: number
  link: { href: string }
  locked: boolean
  parent: string
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

export interface IMmpClientMapRequest extends IMmpClientEditingRequest {
  map: IMmpClientMap
  diff: Partial<IMmpClientNode[]>
}

export interface IMmpClientMapCreateRequest {
  rootNode: IMmpClientNodeBasics
}

export interface IMmpClientDeleteRequest {
  adminId: string
  mapId: string
}
