import type { MapNodeCoordinates } from '@teammapper/shared';
import {
  ARROW_BEND,
  arrowCurve,
  arrowPath,
  borderPoint,
} from './arrow-geometry.js';
import type { Bounds } from './node-geometry.js';

/** A box of `width` by `height` centered on (x, y). */
function box(x: number, y: number, width = 100, height = 40): Bounds {
  return {
    minX: x - width / 2,
    maxX: x + width / 2,
    minY: y - height / 2,
    maxY: y + height / 2,
  };
}

// Absorbs floating-point error, far below one pixel
const ROUNDING = 0.01;

/** Whether the point lies on the border of the box. */
function onBorder(bounds: Bounds, point: MapNodeCoordinates): boolean {
  const near = (a: number, b: number) => Math.abs(a - b) < ROUNDING;
  const insideX =
    point.x >= bounds.minX - ROUNDING && point.x <= bounds.maxX + ROUNDING;
  const insideY =
    point.y >= bounds.minY - ROUNDING && point.y <= bounds.maxY + ROUNDING;
  return (
    ((near(point.x, bounds.minX) || near(point.x, bounds.maxX)) && insideY) ||
    ((near(point.y, bounds.minY) || near(point.y, bounds.maxY)) && insideX)
  );
}

describe('borderPoint', () => {
  it('leaves the box through its right side toward a point to the right', () => {
    expect(borderPoint(box(0, 0), { x: 300, y: 0 })).toEqual({ x: 50, y: 0 });
  });

  it('leaves the box through its top toward a point above', () => {
    expect(borderPoint(box(0, 0), { x: 0, y: -300 })).toEqual({ x: 0, y: -20 });
  });

  it('leaves through a corner side for a diagonal direction', () => {
    const point = borderPoint(box(0, 0), { x: 100, y: 100 });

    expect(point).toEqual({ x: 20, y: 20 });
  });

  it('returns the center for a point at the center', () => {
    expect(borderPoint(box(10, 10), { x: 10, y: 10 })).toEqual({
      x: 10,
      y: 10,
    });
  });
});

describe('arrowCurve', () => {
  const source = box(0, 0);
  const target = box(400, 0);

  it('starts on the border of the source node', () => {
    const curve = arrowCurve(source, target);

    expect(curve && onBorder(source, curve.start)).toBe(true);
  });

  it('ends on the border of the target node', () => {
    const curve = arrowCurve(source, target);

    expect(curve && onBorder(target, curve.end)).toBe(true);
  });

  it('bends to one side by a fixed fraction of the distance', () => {
    const curve = arrowCurve(source, target);

    expect(curve?.control.x).toBeCloseTo(200);
    expect(Math.abs(curve?.control.y ?? 0)).toBeCloseTo(400 * ARROW_BEND);
  });

  it('bends the two directions to opposite sides', () => {
    const there = arrowCurve(source, target);
    const back = arrowCurve(target, source);

    expect(Math.sign(there?.control.y ?? 0)).toBe(
      -Math.sign(back?.control.y ?? 0)
    );
  });

  it('returns null for two boxes on the same center', () => {
    expect(arrowCurve(source, box(0, 0))).toBeNull();
  });
});

describe('arrowPath', () => {
  it('writes a quadratic curve from start through control to end', () => {
    expect(
      arrowPath({
        start: { x: 1, y: 2 },
        control: { x: 3, y: 4 },
        end: { x: 5, y: 6 },
      })
    ).toBe('M1,2Q3,4,5,6');
  });
});
