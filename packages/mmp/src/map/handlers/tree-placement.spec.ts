import {
  findClearSpot,
  NEW_TREE_FOOTPRINT,
  NEW_TREE_GAP,
  nodeBounds,
  treeBounds,
} from './tree-placement.js';
import { NODE_HORIZONTAL_SPACING, type Bounds } from './node-geometry.js';

const POINT: Bounds = { minX: 0, maxX: 0, minY: 0, maxY: 0 };

describe('findClearSpot', () => {
  it('returns the start when nothing is in the way', () => {
    const start = { x: 17, y: -42 };

    expect(findClearSpot(start, NEW_TREE_FOOTPRINT, [], NEW_TREE_GAP)).toEqual(
      start
    );
  });

  it('returns the nearest point that clears the obstacle', () => {
    const obstacle = { minX: -150, maxX: 50, minY: -250, maxY: 250 };

    // The right edge at x = 50 lies 30 from the start, the left edge 170 and
    // the vertical edges 250.
    expect(findClearSpot({ x: 20, y: 0 }, POINT, [obstacle], 0)).toEqual({
      x: 50,
      y: 0,
    });
  });

  it('returns a corner where the edges of two obstacles meet', () => {
    const covering = { minX: -100, maxX: 50, minY: -100, maxY: 200 };
    const right = { minX: 40, maxX: 500, minY: -500, maxY: 40 };

    // The right obstacle blocks the right edge of the covering one up to
    // y = 40, so the nearest clear point takes x from the covering obstacle
    // and y from the right one, about 64 from the start. The edges at
    // x = -100 and y = -100 lie 100 away.
    expect(findClearSpot({ x: 0, y: 0 }, POINT, [covering, right], 0)).toEqual({
      x: 50,
      y: 40,
    });
  });

  it('counts a footprint that touches an obstacle as clear', () => {
    const obstacle = { minX: -100, maxX: 0, minY: -100, maxY: 100 };

    expect(findClearSpot({ x: 0, y: 0 }, POINT, [obstacle], 0)).toEqual({
      x: 0,
      y: 0,
    });
  });

  it('keeps the gap to every obstacle it passes', () => {
    const obstacles = [
      { minX: -150, maxX: 150, minY: -150, maxY: 150 },
      { minX: 150, maxX: 450, minY: -150, maxY: 150 },
    ];
    const footprint = { minX: -40, maxX: 40, minY: -20, maxY: 20 };

    const { x, y } = findClearSpot({ x: 0, y: 0 }, footprint, obstacles, 50);

    for (const o of obstacles) {
      const clear =
        x + footprint.maxX <= o.minX - 50 ||
        x + footprint.minX >= o.maxX + 50 ||
        y + footprint.maxY <= o.minY - 50 ||
        y + footprint.minY >= o.maxY + 50;
      expect(clear).toBe(true);
    }
  });

  it('accepts the spot the right-edge rule picks for a new tree', () => {
    const rightEdge = 1060;
    const obstacle = { minX: 0, maxX: rightEdge, minY: -30, maxY: 30 };
    const start = { x: rightEdge + 2 * NODE_HORIZONTAL_SPACING, y: 0 };

    expect(
      findClearSpot(start, NEW_TREE_FOOTPRINT, [obstacle], NEW_TREE_GAP)
    ).toEqual(start);
  });
});

describe('treeBounds', () => {
  it('returns one bounding box per tree over every node of the tree', () => {
    const rootA = { coordinates: { x: 0, y: 0 }, dimensions: sized(100, 40) };
    const childA = {
      coordinates: { x: -200, y: -120 },
      dimensions: sized(80, 40),
    };
    const rootB = {
      coordinates: { x: 1000, y: 0 },
      dimensions: sized(100, 40),
    };
    const roots = new Map([
      [rootA, rootA],
      [childA, rootA],
      [rootB, rootB],
    ]);

    const bounds = treeBounds([rootA, childA, rootB], node => {
      const root = roots.get(node);
      if (!root) throw new Error('unknown node');
      return root;
    });

    expect(bounds).toEqual([
      { minX: -240, maxX: 50, minY: -140, maxY: 20 },
      nodeBounds(rootB),
    ]);
  });
});

function sized(width: number, height: number) {
  return { width, height };
}
