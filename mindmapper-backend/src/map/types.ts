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
  data: IMmpClientNode[];
}

export interface IMmpClientMapRequest {
  map: IMmpClientMap
}

export interface IMmpClientNode {
  colors: IMmpClientColor;
  coordinates: IMmpClientCoordinates;
  font: IMmpClientFont;
  id: string;
  image: { src: string; size: number };
  k: number;
  locked: boolean;
  name: string;
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

export interface IMmpClientNodeSelectionRequest {
  mapId: string;
  nodeId: string;
  selected: boolean;
}

export interface IClientCache {
  [clientId: string]: string
}
