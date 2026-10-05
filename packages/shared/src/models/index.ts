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
  /**
   * An `image:<uuid>` reference or a raster data URL. Empty or null means no
   * image. Typed as string because rows, caches and imports carry unchecked
   * values; narrow with `isImageReference` and `isImageDataUrl`.
   */
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
  /** Protects this node and its descendants against local edits. */
  protected?: boolean;
  isRoot?: boolean;
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

/** The server's answer to an AI generate request. */
export interface MermaidCreateResult {
  mermaid: string;
  /** True when the LLM hit its output token cap and cut the map short. */
  truncated: boolean;
}

export interface SystemSettingsInfo {
  name: string;
  version: string;
  /** The LLM that AI generate uses; null when AI generate is off. */
  aiModel: string | null;
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

export type NodeProperty =
  | 'name'
  | 'protected'
  | 'coordinates'
  | 'imageSrc'
  | 'imageSize'
  | 'linkHref'
  | 'backgroundColor'
  | 'branchColor'
  | 'fontWeight'
  | 'fontStyle'
  | 'fontSize'
  | 'nameColor';

export type NodePropertyValue =
  string | number | boolean | MapNodeCoordinates | null | undefined;

/**
 * The view state of one client's map: which nodes hide their child nodes.
 * It stays local to the client and never reaches the map data.
 */
export interface MapViewState {
  nodesWithHiddenChildren: string[];
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
  // Legacy rows carry neither, so the /maps listing sends both as null.
  adminId: string | null;
  modificationSecret: string | null;
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
  nodeSelect: ExportNodeProperties;
  nodeDeselect: ExportNodeProperties;
  nodeProtected: ExportNodeProperties;
  viewStateChange: MapViewState;
  /** The map data changed, by a local, a peer's or an undo write. */
  mapChange: void;
}

export type MmpEventType = keyof MmpEventPayloadMap;

export interface Settings {
  systemSettings: SystemSettings;
  userSettings: UserSettings;
}
