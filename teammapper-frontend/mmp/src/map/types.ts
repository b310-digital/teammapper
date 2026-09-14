import {
  ExportNodeProperties,
  NodeProperties,
  UserNodeProperties,
} from './models/node';
import { ExportHistory, MapSnapshot } from './handlers/history';
import { DefaultNodeProperties, OptionParameters } from './options';
import type {
  MapCreateEvent,
  NodeUpdateEvent,
  MapDiff,
  SnapshotChanges,
  NodeProperty,
  NodePropertyValue,
  MmpEventPayloadMap,
  MmpEventType,
  CachedMap,
} from '@teammapper/shared';

type MapProperties = Omit<CachedMap, 'options'> & {
  options?: CachedMap['options'];
};

export {
  DefaultNodeProperties,
  ExportHistory,
  ExportNodeProperties,
  MapCreateEvent,
  MapProperties,
  MapSnapshot,
  NodeProperties,
  NodeUpdateEvent,
  OptionParameters,
  UserNodeProperties,
  MapDiff,
  SnapshotChanges,
  NodeProperty,
  NodePropertyValue,
  MmpEventPayloadMap,
  MmpEventType,
};
