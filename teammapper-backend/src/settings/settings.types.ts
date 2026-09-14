import type {
  SystemFeatureFlags,
  SystemSettings,
  SystemSettingsInfo,
  SystemSettingsUrls,
  UserGeneralSettings,
  MapNodeColors,
  MapNodeFont,
  MapNodeLink,
  MapNodeImage,
} from '@teammapper/shared'

export interface NodeSettings {
  name: string
  link: MapNodeLink
  image: MapNodeImage
  colors: MapNodeColors
  font: MapNodeFont
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
  SystemFeatureFlags,
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
