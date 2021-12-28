import { MapSnapshot, ExportNodeProperties } from '@mmp/map/types'

interface ResponseServer {
  // socket id of the triggering client, to prevent endless update loops
  clientId: string
}

interface ResponseMapUpdated extends ResponseServer {
    map: ServerMap
}

interface ResponseNodeUpdated extends ResponseServer {
    node: ExportNodeProperties
    property: string
}

interface ResponseNodeAdded extends ResponseServer {
    node: ExportNodeProperties
}

interface ResponseNodeRemoved extends ResponseServer {
    nodeId: string
}

interface ResponseSelectionUpdated extends ResponseServer {
  nodeId: string
  selected: boolean
}

interface ServerMap {
    uuid: string
    lastModified: string
    deletedAt: Date,
    deleteAfterDays: number,
    data: MapSnapshot
}

export {
  ResponseMapUpdated,
  ResponseNodeAdded,
  ResponseNodeRemoved,
  ResponseNodeUpdated,
  ResponseSelectionUpdated,
  ServerMap
}