import type { ExportNodeProperties } from '@teammapper/shared';
import { DefaultNodeValues } from '../map/options.js';

/**
 * A full node record with the default styling, `overrides` applied. Every
 * node starts at the origin, unprotected, with k 1 and no parent.
 */
export function nodeRecord(
  overrides: Partial<ExportNodeProperties> & { id: string }
): ExportNodeProperties {
  return {
    parent: '',
    k: 1,
    name: '',
    coordinates: { x: 0, y: 0 },
    image: { ...DefaultNodeValues.image },
    colors: { ...DefaultNodeValues.colors },
    font: { ...DefaultNodeValues.font },
    link: { ...DefaultNodeValues.link },
    protected: false,
    isRoot: false,
    ...overrides,
  };
}
