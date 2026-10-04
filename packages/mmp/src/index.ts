import { OptionParameters } from './map/options.js';
import MmpMap from './map/map.js';
import type { MapData } from './map/data/map-data.js';
import { PropertyMapping } from './map/data/property-mapping.js';
import InMemoryMapData from './map/data/in-memory-map-data.js';

export { MmpMap, InMemoryMapData };
export type { OptionParameters, ImageUrlResolver } from './map/options.js';
export type { MapProperties } from './map/types.js';
export type { NodeColors } from './map/data/node-record.js';
export type {
  MapData,
  MapDataChange,
  MapNodeRecord,
} from './map/data/map-data.js';

/**
 * Return a mmp object with all mmp functions. The map reads and writes its
 * nodes through `data` for its whole life, and draws every node `data` holds
 * before `create` returns.
 */
export function create(
  id: string,
  ref: HTMLElement,
  options: OptionParameters | undefined,
  data: MapData
) {
  return new MmpMap(id, ref, options, data);
}

export const NodePropertyMapping = PropertyMapping;
