export interface MapOptions {
  fontIncrement: number,
  fontMaxSize: number,
  fontMinSize: number
}

export interface IMmpClientColor {
  name: string;
  background: string;
  branch: string;
}

export interface IMmpClientCoordinates {
  x: number;
  y: number;
}

export interface IMmpClientFont {
  style: string;
  size: number;
  weight: string;
}

export interface IMmpClientMap {
  uuid: string;
  lastModified: Date;
  deleteAfterDays: number;
  deletedAt: Date;
  data: IMmpClientNode[];
  options: IMmpClientMapOptions;
}

export interface IMmpClientMapWithAdminId {
  map: IMmpClientMap;
  adminId: string;
}

export interface IMmpClientMapRequest {
  map: IMmpClientMap;
}

export interface IMmpClientMapCreateRequest {
  rootNode: IMmpClientNodeBasics
}

export interface IMmpClientNodeBasics {
  colors: IMmpClientColor;
  font: IMmpClientFont;
  name: string;
  image: { src: string; size: number };
}

export interface IMmpClientNode extends IMmpClientNodeBasics {
  coordinates: IMmpClientCoordinates;
  id: string;
  k: number;
  link: { href: string }
  locked: boolean;
  parent: string;
  isRoot: boolean;
}

export interface IMmpClientNodeRequest {
  mapId: string;
  node: IMmpClientNode;
  updatedProperty: string;
}

export interface IMmpClientJoinRequest {
  mapId: string;
  color: string;
}

export interface IMmpClientDeleteRequest {
  adminId: string;
  mapId: string;
}

export interface IMmpClientNodeSelectionRequest {
  mapId: string;
  nodeId: string;
  selected: boolean;
}

export interface IMmpClientMapOptions {
  fontMaxSize: number;
  fontMinSize: number;
  fontIncrement: number;
}

export interface IMmpClientUpdateMapOptionsRequest {
  mapId: string;
  options: IMmpClientMapOptions;
}

export interface IClientCache {
  [clientId: string]: string;
}