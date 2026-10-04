import type { MapNodeDimensions, MapNodeFont } from '@teammapper/shared';
import Draw from '../map/handlers/draw.js';
import { estimateNodeExtent } from '../map/handlers/node-geometry.js';
import type Node from '../map/models/node.js';

/**
 * Stands in for the renderer in specs that drive the node handler without a
 * DOM. It keeps the rings the way the renderer does and draws nothing. A node
 * has the size `sizeOf` returns, and no size by default.
 */
export function fakeDraw(
  sizeOf: (node: Node) => MapNodeDimensions = () => ({ width: 0, height: 0 })
) {
  const rings = new Map<string, string>();

  return {
    update: jest.fn(),
    clear: jest.fn(() => rings.clear()),
    renderNodeProperty: jest.fn(),
    renderPositions: jest.fn(),
    enableNodeNameEditing: jest.fn(),
    blurName: jest.fn(),
    isEditing: () => false,
    ringColor: (node: Node) => Draw.prototype.ringColor(node),
    ringOf: (node: Node) => rings.get(node.id) ?? null,
    setRing: (node: Node, color: string | null) => {
      if (color) rings.set(node.id, color);
      else rings.delete(node.id);
    },
    dimensionsOf: sizeOf,
    estimateExtent: (name: string, font: MapNodeFont) =>
      estimateNodeExtent(name, font.size ?? 16),
  };
}
