import { MapSnapshot, ExportNodeProperties } from '@mmp/map/types';
import { CachedMapOptions } from 'src/app/shared/models/cached-map.model';

interface ResponseServer {
  // socket id of the triggering client, to prevent endless update loops
  clientId: string;
}

interface ResponseMapUpdated extends ResponseServer {
  map: ServerMap;
}

interface ResponseMapOptionsUpdated extends ResponseServer {
  options: CachedMapOptions;
}

interface ResponseNodeUpdated extends ResponseServer {
  node: ExportNodeProperties;
  property: string;
}

interface ResponseNodesAdded extends ResponseServer {
  nodes: ExportNodeProperties[];
}

interface ResponseNodeRemoved extends ResponseServer {
  nodeId: string;
}

interface ResponseSelectionUpdated extends ResponseServer {
  nodeId: string;
  selected: boolean;
}

interface ServerMap {
  uuid: string;
  lastModified: string;
  deletedAt: string;
  deleteAfterDays: number;
  data: MapSnapshot;
  options: CachedMapOptions;
}

interface PrivateServerMap {
  map: ServerMap;
  adminId: string;
  modificationSecret: string;
}

export {
  ResponseMapUpdated,
  ResponseMapOptionsUpdated,
  ResponseNodesAdded,
  ResponseNodeRemoved,
  ResponseNodeUpdated,
  ResponseSelectionUpdated,
  ServerMap,
  PrivateServerMap,
};
