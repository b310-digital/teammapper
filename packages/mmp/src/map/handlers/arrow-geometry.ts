import type { MapNodeCoordinates } from '@teammapper/shared';
import type { Bounds } from './node-geometry.js';

/**
 * The shape of an arrow: a quadratic curve between two node boxes. The curve
 * runs from center to center, bent to one side, and is cut at the border of
 * each box, so it starts and ends where the nodes are drawn.
 */

/**
 * How far the curve bends to the side of the straight line, as a fraction of
 * the distance between the centers. The bend keeps an arrow that runs along a
 * branch apart from the branch.
 */
export const ARROW_BEND = 0.15;

export interface ArrowCurve {
  start: MapNodeCoordinates;
  control: MapNodeCoordinates;
  end: MapNodeCoordinates;
}

function centerOf(bounds: Bounds): MapNodeCoordinates {
  return {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
  };
}

/**
 * The point where the line from the center of the box toward `toward` leaves
 * the box. The center itself when `toward` lies on it.
 */
export function borderPoint(
  bounds: Bounds,
  toward: MapNodeCoordinates
): MapNodeCoordinates {
  const center = centerOf(bounds);
  const dx = toward.x - center.x;
  const dy = toward.y - center.y;
  if (dx === 0 && dy === 0) return center;

  const halfWidth = (bounds.maxX - bounds.minX) / 2;
  const halfHeight = (bounds.maxY - bounds.minY) / 2;
  const scale = Math.min(
    dx === 0 ? Infinity : halfWidth / Math.abs(dx),
    dy === 0 ? Infinity : halfHeight / Math.abs(dy)
  );
  return { x: center.x + dx * scale, y: center.y + dy * scale };
}

/**
 * The curve from the source box to the target box, or null when both boxes
 * share a center. The control point sits on the perpendicular through the
 * midpoint, to the left seen from the source, so the arrows of the two
 * directions bend apart. Each end leaves its box toward the control point,
 * which is the direction of the curve at that end.
 */
export function arrowCurve(source: Bounds, target: Bounds): ArrowCurve | null {
  const from = centerOf(source);
  const to = centerOf(target);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) return null;

  const control = {
    x: (from.x + to.x) / 2 + dy * ARROW_BEND,
    y: (from.y + to.y) / 2 - dx * ARROW_BEND,
  };
  return {
    start: borderPoint(source, control),
    control,
    end: borderPoint(target, control),
  };
}

/** The SVG path data of the curve. */
export function arrowPath(curve: ArrowCurve): string {
  const { start, control, end } = curve;
  return `M${start.x},${start.y}Q${control.x},${control.y},${end.x},${end.y}`;
}
