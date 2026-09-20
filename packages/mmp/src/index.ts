import { OptionParameters } from './map/options.js';
import MmpMap from './map/map.js';
import { PropertyMapping } from './map/handlers/nodes.js';

export { MmpMap };
export type { OptionParameters } from './map/options.js';
export type { MapProperties } from './map/types.js';
export type { NodeColors } from './map/models/node.js';

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
