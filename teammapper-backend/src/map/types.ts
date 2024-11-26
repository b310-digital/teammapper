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
