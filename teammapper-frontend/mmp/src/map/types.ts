import { ExportNodeProperties, NodeProperties, UserNodeProperties } from './models/node'
import { ExportHistory, MapSnapshot } from './handlers/history'
import { DefaultNodeProperties, OptionParameters } from './options'

interface MapCreateEvent {
    previousMapData: MapSnapshot
}

interface MapProperties {
    uuid: string,
    lastModified: number,
    data: MapSnapshot,
    deletedAt: number,
    deleteAfterDays: number
}

interface NodeUpdateEvent {
    nodeProperties: NodeProperties,
    previousValue: any,
    changedProperty: string
}

export {
    DefaultNodeProperties,
    ExportHistory,
    ExportNodeProperties,
    MapCreateEvent,
    MapProperties,
    MapSnapshot,
    NodeProperties,
    NodeUpdateEvent,
    OptionParameters,
    UserNodeProperties
}