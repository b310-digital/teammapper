/**
 * Every field of T present and non-null. `Required<T>` only drops the `?`;
 * these fields are `v.nullable` in the schemas, so the null has to go too.
 */
export type Resolved<T> = { [K in keyof T]-?: NonNullable<T[K]> };

export interface MapNodeCoordinates {
  x: number;
  y: number;
}

export interface MapNodeDimensions {
  width: number;
  height: number;
}

export interface MapNodeColors {
  name?: string | null;
  background?: string | null;
  branch?: string | null;
  link?: string | null;
}

export interface MapNodeFont {
  size?: number | null;
  style?: string | null;
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

export interface UserNodeProperties {
  name?: string | null;
  coordinates?: MapNodeCoordinates;
  image?: MapNodeImage;
  link?: MapNodeLink;
  colors?: MapNodeColors;
  font?: MapNodeFont;
  locked?: boolean;
  isRoot?: boolean;
  detached?: boolean;
  hidden?: boolean;
  hasHiddenChildNodes?: boolean;
}

export interface MapNode extends UserNodeProperties {
  id: string;
  parent: string | null;
  k: number;
}

export type ExportNodeProperties = MapNode;

export type MapSnapshot = MapNode[];

export interface MapOptions {
  fontMaxSize?: number;
  fontMinSize?: number;
  fontIncrement?: number;
}

export type CachedMapOptions = MapOptions;

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
  ttl?: Date | number | string | null;
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

/**
 * The node defaults the settings endpoint sends: a name plus styling, with no
 * position and no place in a tree.
 */
export interface MapNodeSettings {
  name: string;
  link: MapNodeLink;
  image: MapNodeImage;
  colors: MapNodeColors;
  font: MapNodeFont;
  locked?: boolean;
}

/**
 * The map options inside the user settings. The server fills every one of
 * them, so none are optional here, unlike the per-map MapOptions above.
 */
export interface UserMapOptions extends Required<MapOptions> {
  centerOnResize: boolean;
  autoBranchColors: boolean;
  showLinktext: boolean;
  defaultNode: MapNodeSettings;
  rootNode: MapNodeSettings;
}

export interface UserSettings {
  general: UserGeneralSettings;
  mapOptions: UserMapOptions;
}

export type SnapshotChanges = Record<
  string,
  Partial<ExportNodeProperties> | undefined
>;

export interface MapDiff {
  added: SnapshotChanges;
  deleted: SnapshotChanges;
  updated: SnapshotChanges;
}

export type NodeProperty =
  | 'name'
  | 'locked'
  | 'coordinates'
  | 'imageSrc'
  | 'imageSize'
  | 'linkHref'
  | 'backgroundColor'
  | 'branchColor'
  | 'fontWeight'
  | 'fontStyle'
  | 'fontSize'
  | 'nameColor'
  | 'hidden';

export type NodePropertyValue =
  | string
  | number
  | boolean
  | MapNodeCoordinates
  | null
  | undefined;

export interface NodeUpdateEvent {
  nodeProperties: ExportNodeProperties;
  previousValue: unknown;
  changedProperty: NodeProperty | string;
}

export interface MapCreateEvent {
  previousMapData?: MapSnapshot;
}

export interface CachedMap {
  lastModified: number;
  createdAt: number;
  data: MapSnapshot;
  uuid: string;
  deleteAfterDays: number;
  deletedAt: number;
  options: CachedMapOptions;
}

export interface CachedMapEntry {
  cachedMap: CachedMap;
  key: string;
}

export interface CachedAdminMapValue {
  adminId: string;
  modificationSecret: string;
  ttl: Date | number | string;
  rootName: string | null;
}

export interface CachedAdminMapEntry {
  id: string;
  cachedAdminMapValue: CachedAdminMapValue;
}

export interface OldMmpNodeValue {
  parent?: string;
  k?: number;
  name?: string;
  fixed?: boolean;
  x?: number;
  y?: number;
  'image-size'?: string;
  'image-src'?: string;
  'background-color'?: string;
  'branch-color'?: string;
  'text-color'?: string;
  'font-size'?: string;
  bold?: boolean;
  italic?: boolean;
}

export interface OldMmpNode {
  key: string;
  value: OldMmpNodeValue;
}

export interface MmpEventPayloadMap {
  create: MapCreateEvent;
  center: void;
  undo: MapDiff;
  redo: MapDiff;
  exportJSON: void;
  exportImage: void;
  zoomIn: void;
  zoomOut: void;
  nodeSelect: ExportNodeProperties;
  nodeDeselect: ExportNodeProperties;
  nodeUpdate: NodeUpdateEvent;
  nodeCreate: ExportNodeProperties;
  nodePaste: ExportNodeProperties[];
  nodeRemove: ExportNodeProperties;
  distribute: void;
}

export type MmpEventType = keyof MmpEventPayloadMap;

export interface Settings {
  systemSettings: SystemSettings;
  userSettings: UserSettings;
}
