import type {
  SystemFeatureFlags as FeatureFlags,
  SystemSettings,
  SystemSettingsInfo,
  SystemSettingsUrls,
  UserGeneralSettings,
  MapNodeColors,
  MapNodeFont,
  MapNodeLink,
  MapNodeImage,
} from '@teammapper/shared'

export type NodeColors = MapNodeColors
export type NodeFont = MapNodeFont
export type NodeLink = MapNodeLink
export type NodeImage = MapNodeImage

export interface NodeSettings {
  name: string
  link: NodeLink
  image: NodeImage
  colors: NodeColors
  font: NodeFont
  locked?: boolean
}

export interface MapOptions {
  centerOnResize: boolean
  autoBranchColors: boolean
  showLinktext: boolean
  fontMaxSize: number
  fontMinSize: number
  fontIncrement: number
  defaultNode: NodeSettings
  rootNode: NodeSettings
}

export type {
  FeatureFlags,
  SystemSettings,
  SystemSettingsInfo,
  SystemSettingsUrls,
}

export interface Settings {
  systemSettings: SystemSettings
  userSettings: {
    general: UserGeneralSettings
    mapOptions: MapOptions
  }
}
