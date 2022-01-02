import { DefaultNodeProperties } from '@mmp/map/types'

export interface MapOptions {
  centerOnResize: boolean
  // not used inside mmp?
  autoBranchColors: boolean
  defaultNode: DefaultNodeProperties
  rootNode: DefaultNodeProperties
}

export interface Settings {
  general: General
  mapOptions: MapOptions
}

interface General {
  language: string
}
