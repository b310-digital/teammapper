import type { MapNodeCoordinates, MapNodeDimensions } from '@teammapper/shared';
import {
  NODE_HORIZONTAL_SPACING,
  NODE_VERTICAL_SPACING,
  type Bounds,
} from './node-geometry.js';

/**
 * The search for the coordinates of a new tree's root. A spot counts as clear
 * when the new tree's footprint keeps `gap` away from the bounding box of
 * every other tree. The search compares bounding boxes, not node shapes.
 */

interface PlacedNode {
  coordinates: MapNodeCoordinates;
  dimensions: MapNodeDimensions;
}

// The free space the search keeps between a new tree and every other tree.
export const NEW_TREE_GAP = NODE_HORIZONTAL_SPACING / 2;

// Half the height of a node with a one-line name, rounded up.
const HALF_NODE_HEIGHT = 30;

/**
 * The room a new root and its first two children take, relative to the
 * root's coordinates. The footprint reserves room for these two children
 * only. `pickColumn` puts the first child one spacing left of the root and
 * the second one spacing right of it, and `stackBelow` puts each
 * NODE_VERTICAL_SPACING above the root. The footprint reaches half a spacing
 * past each child.
 */
export const NEW_TREE_FOOTPRINT: Bounds = {
  minX: -1.5 * NODE_HORIZONTAL_SPACING,
  maxX: 1.5 * NODE_HORIZONTAL_SPACING,
  minY: -(NODE_VERTICAL_SPACING + HALF_NODE_HEIGHT),
  maxY: HALF_NODE_HEIGHT,
};

export function nodeBounds(node: PlacedNode): Bounds {
  const { x, y } = node.coordinates;
  const { width, height } = node.dimensions;

  return {
    minX: x - width / 2,
    maxX: x + width / 2,
    minY: y - height / 2,
    maxY: y + height / 2,
  };
}

export function unionBounds(a: Bounds, b: Bounds): Bounds {
  return {
    minX: Math.min(a.minX, b.minX),
    maxX: Math.max(a.maxX, b.maxX),
    minY: Math.min(a.minY, b.minY),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

function expandBounds(bounds: Bounds, margin: number): Bounds {
  return {
    minX: bounds.minX - margin,
    maxX: bounds.maxX + margin,
    minY: bounds.minY - margin,
    maxY: bounds.maxY + margin,
  };
}

export function moveBounds(bounds: Bounds, by: MapNodeCoordinates): Bounds {
  return {
    minX: bounds.minX + by.x,
    maxX: bounds.maxX + by.x,
    minY: bounds.minY + by.y,
    maxY: bounds.maxY + by.y,
  };
}

/** Two bounding boxes that only touch do not overlap. */
function overlaps(a: Bounds, b: Bounds): boolean {
  return (
    a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY
  );
}

/**
 * One bounding box per tree, over every node of the tree, hidden nodes
 * included.
 */
export function treeBounds<T extends PlacedNode>(
  nodes: T[],
  treeRootOf: (node: T) => T
): Bounds[] {
  const byRoot = new Map<T, Bounds>();

  for (const node of nodes) {
    const root = treeRootOf(node);
    const bounds = nodeBounds(node);
    const known = byRoot.get(root);
    byRoot.set(root, known ? unionBounds(known, bounds) : bounds);
  }

  return Array.from(byRoot.values());
}

/**
 * Return the point nearest to `start` where `footprint`, moved to that
 * point, overlaps no obstacle grown by `gap`. A footprint that touches a
 * grown obstacle counts as clear.
 *
 * The nearest clear point either is `start` or puts an edge of the footprint
 * on an edge of a grown obstacle, on each axis where it leaves `start`. The
 * search therefore tests every combination of those x and y values and keeps
 * the nearest clear one, so the result is exact. Candidates run in obstacle
 * order with `start` first, and a tie keeps the first candidate found.
 * @returns {MapNodeCoordinates} the point
 */
export function findClearSpot(
  start: MapNodeCoordinates,
  footprint: Bounds,
  obstacles: Bounds[],
  gap: number
): MapNodeCoordinates {
  const blocked = obstacles.map(obstacle => expandBounds(obstacle, gap));
  const isClear = (point: MapNodeCoordinates) => {
    const placed = moveBounds(footprint, point);
    return blocked.every(obstacle => !overlaps(placed, obstacle));
  };

  const xs = [start.x];
  const ys = [start.y];
  for (const b of blocked) {
    xs.push(b.maxX - footprint.minX, b.minX - footprint.maxX);
    ys.push(b.maxY - footprint.minY, b.minY - footprint.maxY);
  }

  let best: MapNodeCoordinates = start;
  let bestDistance = Infinity;

  for (const x of xs) {
    for (const y of ys) {
      const distance = Math.hypot(x - start.x, y - start.y);
      if (distance < bestDistance && isClear({ x, y })) {
        best = { x, y };
        bestDistance = distance;
      }
    }
  }

  return best;
}
