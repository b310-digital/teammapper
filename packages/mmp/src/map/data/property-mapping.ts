import type { NodeProperty } from '@teammapper/shared';

/**
 * The path of each node property mmp exposes inside a node record. mmp reads
 * a property through this path, and each `MapData` implementation writes an
 * `updateNode` through it.
 */
export const PropertyMapping = {
  name: ['name'],
  protected: ['protected'],
  coordinates: ['coordinates'],
  imageSrc: ['image', 'src'],
  imageSize: ['image', 'size'],
  linkHref: ['link', 'href'],
  backgroundColor: ['colors', 'background'],
  branchColor: ['colors', 'branch'],
  fontWeight: ['font', 'weight'],
  fontStyle: ['font', 'style'],
  fontSize: ['font', 'size'],
  nameColor: ['colors', 'name'],
} as const satisfies Record<NodeProperty, readonly string[]>;

export const isNodeProperty = (property: string): property is NodeProperty =>
  Object.keys(PropertyMapping).includes(property);
