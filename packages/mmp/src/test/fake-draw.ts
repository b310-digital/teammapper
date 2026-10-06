import type {
  MapNodeCoordinates,
  MapNodeDimensions,
  MapNodeFont,
} from '@teammapper/shared';
import Draw from '../map/handlers/draw.js';
import { estimateNodeExtent } from '../map/handlers/node-geometry.js';
import type { ResolvedNode } from '../map/data/node-record.js';

/**
 * Stands in for the renderer in specs that drive the node handler without a
 * DOM. It keeps the rings and the drag preview the way the renderer does and
 * draws nothing. A node has the size `sizeOf` returns, and no size by
 * default.
 */
export function fakeDraw(
  sizeOf: (node: ResolvedNode) => MapNodeDimensions = () => ({
    width: 0,
    height: 0,
  })
) {
  const rings = new Map<string, string>();
  const preview = new Map<string, MapNodeCoordinates>();

  return {
    drawAll: jest.fn(() => rings.clear()),
    redrawAll: jest.fn(),
    drawNodes: jest.fn(),
    drawSubtree: jest.fn(),
    removeNodes: jest.fn((): string[] => []),
    renderPositions: jest.fn(),
    enableNodeNameEditing: jest.fn(),
    blurName: jest.fn(),
    isEditing: () => false,
    ringColor: (node: ResolvedNode) => Draw.prototype.ringColor(node),
    ringOf: (id: string) => rings.get(id) ?? null,
    setRing: (id: string, color: string | null) => {
      if (color) rings.set(id, color);
      else rings.delete(id);
    },
    previewOf: (id: string) => preview.get(id),
    setPreview: (id: string, position: MapNodeCoordinates) => {
      preview.set(id, { ...position });
    },
    takePreview: () => {
      const positions = new Map(preview);
      preview.clear();
      return positions;
    },
    dimensionsOf: sizeOf,
    estimateExtent: (name: string, font: MapNodeFont) =>
      estimateNodeExtent(name, font.size ?? 16),
  };
}
