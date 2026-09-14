export interface MapNodeCoordinates {
  x: number;
  y: number;
}

export interface MapNodeColors {
  name?: string | null;
  background?: string | null;
  branch?: string | null;
  link?: string | null;
}

export interface MapNodeFont {
  style?: string | null;
  size?: number | null;
  weight?: string | null;
}

export interface MapNodeImage {
  src?: string | null;
  size?: number | null;
}

export interface MapNodeLink {
  href?: string | null;
}

export interface MapNodeBasics {
  colors: MapNodeColors;
  font: MapNodeFont;
  name: string | null;
  image: MapNodeImage;
}

export interface MapNode extends MapNodeBasics {
  id: string;
  parent: string | null;
  isRoot: boolean;
  coordinates: MapNodeCoordinates;
  detached: boolean;
  k: number;
  link: MapNodeLink;
  locked: boolean;
  hidden?: boolean;
  hasHiddenChildNodes?: boolean;
}

export interface MapOptions {
  fontMaxSize?: number;
  fontMinSize?: number;
  fontIncrement?: number;
}

export interface ClientMap {
  uuid: string;
  data: MapNode[];
  options: MapOptions;
  createdAt?: Date | number | string | null;
  lastModified?: Date | number | string | null;
  lastAccessed?: Date | number | string | null;
  deleteAfterDays?: number;
  deletedAt?: Date | number | string | null;
  writable?: boolean;
}

export interface ClientMapInfo {
  uuid: string;
  adminId: string | null;
  modificationSecret: string | null;
  ttl?: Date | number | string;
  rootName: string | null;
}

export interface ClientPrivateMap {
  map: ClientMap;
  adminId: string | null;
  modificationSecret: string | null;
}

export interface SystemSettingsInfo {
  name: string;
  version: string;
}

export interface SystemSettingsUrls {
  pictogramApiUrl: string;
  pictogramStaticUrl: string;
}

export interface SystemFeatureFlags {
  pictograms: boolean;
  ai: boolean;
}

export interface SystemSettings {
  info: SystemSettingsInfo;
  urls: SystemSettingsUrls;
  featureFlags: SystemFeatureFlags;
}

export interface UserGeneralSettings {
  language: string;
  darkMode: boolean;
}

export interface UserSettings {
  general: UserGeneralSettings;
  mapOptions: MapOptions & {
    autoBranchColors?: boolean;
    showLinktext?: boolean;
  };
}

export interface Settings {
  systemSettings: SystemSettings;
  userSettings: UserSettings;
}
