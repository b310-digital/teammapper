import { OptionParameters } from './map/options.js';
import MmpMap from './map/map.js';
import { PropertyMapping } from './map/data/property-mapping.js';
import InMemoryMapData from './map/data/in-memory-map-data.js';

export { MmpMap, InMemoryMapData };
export type { OptionParameters, ImageUrlResolver } from './map/options.js';
export type { MapProperties } from './map/types.js';
export type { NodeColors } from './map/models/node.js';
export type {
  MapData,
  MapDataChange,
  MapNodeRecord,
} from './map/data/map-data.js';

/**
 * Return a mmp object with all mmp functions.
 */
export function create(
  id: string,
  ref: HTMLElement,
  options?: OptionParameters
) {
  return new MmpMap(id, ref, options);
}

export const NodePropertyMapping = PropertyMapping;
