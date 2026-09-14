export interface NodeColors {
  name: string
  background: string
  branch?: string
}

export interface NodeFont {
  size: number
  style: string
  weight: string
}

export interface NodeLink {
  href: string
}

export interface NodeImage {
  src: string
  size: number
}

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

import type {
  SystemFeatureFlags as FeatureFlags,
  SystemSettingsInfo,
  SystemSettingsUrls,
  UserGeneralSettings,
} from '@teammapper/shared'

export type { FeatureFlags }

export interface Settings {
  systemSettings: {
    info: SystemSettingsInfo
    urls: SystemSettingsUrls
    featureFlags: FeatureFlags
  }
  userSettings: {
    general: UserGeneralSettings
    mapOptions: MapOptions
  }
}
