import { OptionParameters } from './map/options.js';
import MmpMap, { type MmpInstance } from './map/map.js';
import type { MapData } from './map/data/map-data.js';

export type { MmpInstance };
export type { OptionParameters, ImageUrlResolver } from './map/options.js';
export type {
  MmpEventPayloadMap,
  MmpEventType,
} from './map/handlers/events.js';
export type { NodeColors } from './map/data/node-record.js';
export type {
  MapData,
  MapDataChange,
  MapNodeRecord,
} from './map/data/map-data.js';

/**
 * Return a mmp instance with all mmp functions. The map reads and writes its
 * nodes through `data` for its whole life, and draws every node `data` holds
 * before `create` returns.
 */
export function create(
  ref: HTMLElement,
  data: MapData,
  options?: OptionParameters
): MmpInstance {
  return new MmpMap(ref, options, data).instance;
}
