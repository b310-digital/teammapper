import { OptionParameters } from './map/options';
import MmpMap from './map/map';
import { PropertyMapping } from './map/handlers/nodes';

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
