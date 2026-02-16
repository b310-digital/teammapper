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

export interface FeatureFlags {
  pictograms: boolean
  ai: boolean
  yjs: boolean
}

export interface Settings {
  systemSettings: {
    info: { name: string; version: string }
    urls: { pictogramApiUrl: string; pictogramStaticUrl: string }
    featureFlags: FeatureFlags
  }
  userSettings: {
    general: { language: string }
    mapOptions: MapOptions
  }
}
