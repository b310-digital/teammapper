import { computeMapLayout, LayoutInputNode } from './layout';
import { NODE_HORIZONTAL_SPACING, estimateNodeExtent } from './node-geometry';
import type { Coordinates, Dimensions } from '../models/node';

/** The module's fallback box and node gaps, restated because it exports none. */
const DEFAULT_BOX = { width: 100, height: 30 };
const VERTICAL_GAP = 20;
const COLUMN_PADDING = VERTICAL_GAP;

type Box = Coordinates & Dimensions;

function boxesOverlap(a: Box, b: Box): boolean {
  const aLeft = a.x - a.width / 2;
  const aRight = a.x + a.width / 2;
  const aTop = a.y - a.height / 2;
  const aBottom = a.y + a.height / 2;
  const bLeft = b.x - b.width / 2;
  const bRight = b.x + b.width / 2;
  const bTop = b.y - b.height / 2;
  const bBottom = b.y + b.height / 2;

  return aLeft < bRight && bLeft < aRight && aTop < bBottom && bTop < aBottom;
}

function findAnyAABBOverlap(boxes: Box[]): [number, number] | null {
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      if (boxesOverlap(boxes[i], boxes[j])) {
        return [i, j];
      }
    }
  }
  return null;
}

function node(
  id: string,
  parent: string,
  overrides: Partial<LayoutInputNode> = {}
): LayoutInputNode {
  return { id, parent, ...overrides };
}

/**
 * The largest shape an AI/mermaid import produces: root + 4 branches of 3
 * children, none of them carrying coordinates. `sized` receives the branch
 * letter and child index, or nothing for the root, so the same shape can be
 * built at each of the three sizes a node can have: none at all, a measured
 * box, or a label to estimate from.
 */
function buildAiShape(
  sized: (
    branch?: string,
    index?: number
  ) => Partial<LayoutInputNode> = () => ({})
): LayoutInputNode[] {
  const nodes: LayoutInputNode[] = [
    node('root', '', { isRoot: true, ...sized() }),
  ];

  for (const branch of ['A', 'B', 'C', 'D']) {
    nodes.push(node(branch, 'root', sized(branch)));
    for (let i = 1; i <= 3; i++) {
      nodes.push(node(`${branch}${i}`, branch, sized(branch, i)));
    }
  }
  return nodes;
}

function measuredAt(dimensions: Dimensions) {
  return () => ({ dimensions });
}

/**
 * Asymmetric subtree depths: root -> A, B, C, D where A and C each have 3
 * children but B and D are leaves. Sibling-relative placement collides here
 * even when the siblings are visited in order, because it cannot see how many
 * levels a neighbouring subtree spans.
 */
function buildAsymmetricShape(dimensions: Dimensions): LayoutInputNode[] {
  const nodes: LayoutInputNode[] = [
    node('root', '', { isRoot: true }),
    node('A', 'root'),
    node('B', 'root'),
    node('C', 'root'),
    node('D', 'root'),
  ];

  for (let i = 1; i <= 3; i++) {
    nodes.push(node(`A${i}`, 'A'));
    nodes.push(node(`C${i}`, 'C'));
  }

  return nodes.map(n => ({ ...n, dimensions }));
}

describe('computeMapLayout', () => {
  it('returns a coordinate for every node, including detached ones', () => {
    const nodes: LayoutInputNode[] = [
      node('root', '', { isRoot: true }),
      node('child', 'root'),
      node('orphan', 'missing-parent', { detached: true }),
    ];

    const coords = computeMapLayout(nodes);

    expect(nodes.every(n => coords.has(n.id))).toBe(true);
  });

  it('returns an empty map for empty input', () => {
    const coords = computeMapLayout([]);

    expect(coords.size).toBe(0);
  });

  it('keeps the root at its existing coordinates in a root-only map', () => {
    const nodes: LayoutInputNode[] = [
      node('root', '', { isRoot: true, coordinates: { x: 123, y: 456 } }),
    ];

    const coords = computeMapLayout(nodes);

    expect(coords.get('root')).toEqual({ x: 123, y: 456 });
  });

  it('anchors the root at (0, 0) when it has no existing coordinates', () => {
    const nodes: LayoutInputNode[] = [node('root', '', { isRoot: true })];

    const coords = computeMapLayout(nodes);

    expect(coords.get('root')).toEqual({ x: 0, y: 0 });
  });

  it('keeps a root child on the side it already occupied', () => {
    const nodes: LayoutInputNode[] = [
      node('root', '', { isRoot: true, coordinates: { x: 0, y: 0 } }),
      node('leftChild', 'root', { coordinates: { x: -200, y: 0 } }),
      node('rightChild', 'root', { coordinates: { x: 200, y: 0 } }),
    ];

    const coords = computeMapLayout(nodes);
    const rootX = coords.get('root')!.x;

    expect(coords.get('leftChild')!.x).toBeLessThan(rootX);
    expect(coords.get('rightChild')!.x).toBeGreaterThan(rootX);
  });

  it('balances root children without existing coordinates across both sides', () => {
    const nodes: LayoutInputNode[] = [
      node('root', '', { isRoot: true }),
      node('c1', 'root'),
      node('c2', 'root'),
      node('c3', 'root'),
      node('c4', 'root'),
    ];

    const coords = computeMapLayout(nodes);
    const rootX = coords.get('root')!.x;
    const sides = ['c1', 'c2', 'c3', 'c4'].map(id =>
      coords.get(id)!.x < rootX ? 'left' : 'right'
    );

    expect(sides.filter(side => side === 'left')).toHaveLength(2);
    expect(sides.filter(side => side === 'right')).toHaveLength(2);
  });

  it('separates siblings by more than their own half-heights', () => {
    const dimensions = { width: 100, height: 40 };
    const nodes: LayoutInputNode[] = [
      node('root', '', { isRoot: true, dimensions }),
      node('branch', 'root', { dimensions }),
      node('a', 'branch', { dimensions }),
      node('b', 'branch', { dimensions }),
    ];

    const coords = computeMapLayout(nodes);

    // Packing the boxes edge-to-edge would put them exactly 40px apart, which
    // renders as two nodes touching. The gap on top is what makes it readable.
    const gap = Math.abs(coords.get('a')!.y - coords.get('b')!.y);
    expect(gap).toBeGreaterThan(dimensions.height);
    expect(gap).toBeCloseTo(dimensions.height + VERTICAL_GAP);
  });

  it('leaves horizontal padding between columns of wide labels', () => {
    // Wide enough that the labels, not the fixed column spacing, set the
    // distance: their half-widths already exceed NODE_HORIZONTAL_SPACING.
    const rootBox = { width: NODE_HORIZONTAL_SPACING, height: 30 };
    const childBox = { width: NODE_HORIZONTAL_SPACING - 10, height: 30 };
    const nodes: LayoutInputNode[] = [
      node('root', '', { isRoot: true, dimensions: rootBox }),
      node('child', 'root', { dimensions: childBox }),
    ];

    const coords = computeMapLayout(nodes);

    const distance = Math.abs(coords.get('child')!.x - coords.get('root')!.x);
    const touching = (rootBox.width + childBox.width) / 2;
    expect(distance).toBeGreaterThan(touching);
    expect(distance).toBeCloseTo(touching + COLUMN_PADDING);
  });

  it('keeps a root with branches on its saved position, straddled by them', () => {
    const dimensions = { width: 100, height: 30 };
    const anchor = { x: 25, y: -40 };
    const nodes: LayoutInputNode[] = [
      node('root', '', { isRoot: true, coordinates: anchor, dimensions }),
      node('c1', 'root', { coordinates: { x: 225, y: -40 }, dimensions }),
      node('c2', 'root', { coordinates: { x: 225, y: 20 }, dimensions }),
      node('c3', 'root', { coordinates: { x: 225, y: 80 }, dimensions }),
    ];

    const coords = computeMapLayout(nodes);

    // Every side is laid out around zero and then offset by the anchor, so a
    // root away from the origin has to carry its whole branch with it.
    expect(coords.get('root')).toEqual(anchor);
    const childYs = ['c1', 'c2', 'c3'].map(id => coords.get(id)!.y);
    const mean = childYs.reduce((sum, y) => sum + y, 0) / childYs.length;
    expect(mean).toBeCloseTo(anchor.y);
  });

  it('vertically centres a parent on its children', () => {
    const nodes: LayoutInputNode[] = [
      node('root', '', { isRoot: true }),
      node('parent', 'root'),
      node('c1', 'parent'),
      node('c2', 'parent'),
      node('c3', 'parent'),
    ];

    const coords = computeMapLayout(nodes);
    const childYs = ['c1', 'c2', 'c3'].map(id => coords.get(id)!.y);
    const expectedCenter = (Math.min(...childYs) + Math.max(...childYs)) / 2;

    expect(coords.get('parent')!.y).toBeCloseTo(expectedCenter);
  });

  it('produces no AABB overlap for the 4x3 AI import shape at its fallback size', () => {
    // Neither labels nor measured boxes, so every node is laid out at the
    // module's default size - the state a fresh AI/mermaid import arrives in.
    const nodes = buildAiShape();

    const coords = computeMapLayout(nodes);
    const boxes = nodes.map(n => ({ ...coords.get(n.id)!, ...DEFAULT_BOX }));

    expect(findAnyAABBOverlap(boxes)).toBeNull();
  });

  it('produces no AABB overlap for the 4x3 AI shape when dimensions are measured', () => {
    const dimensions = { width: 120, height: 30 };
    const nodes = buildAiShape(measuredAt(dimensions));

    const coords = computeMapLayout(nodes);
    const boxes = nodes.map(n => ({ ...coords.get(n.id)!, ...dimensions }));

    expect(findAnyAABBOverlap(boxes)).toBeNull();
  });

  it('produces no AABB overlap for asymmetric subtree depths', () => {
    const dimensions = { width: 120, height: 30 };
    const nodes = buildAsymmetricShape(dimensions);

    const coords = computeMapLayout(nodes);
    const boxes = nodes.map(n => ({ ...coords.get(n.id)!, ...dimensions }));

    expect(findAnyAABBOverlap(boxes)).toBeNull();
  });

  it('pushes a column outward rather than overlapping the next when a node is wider than the column spacing', () => {
    const rootDimensions = { width: 100, height: 30 };
    const wideDimensions = { width: 400, height: 30 };
    const childDimensions = { width: 120, height: 30 };
    const nodes: LayoutInputNode[] = [
      node('root', '', { isRoot: true, dimensions: rootDimensions }),
      node('wide', 'root', { dimensions: wideDimensions }),
      node('wideChild', 'wide', { dimensions: childDimensions }),
    ];

    const coords = computeMapLayout(nodes);
    const boxes = [
      { ...coords.get('root')!, ...rootDimensions },
      { ...coords.get('wide')!, ...wideDimensions },
      { ...coords.get('wideChild')!, ...childDimensions },
    ];

    expect(findAnyAABBOverlap(boxes)).toBeNull();
  });

  // Guards against a random tie-break or a dependency on iteration order.
  it('derives coordinates from the input alone, so repeated runs agree', () => {
    const nodes = buildAiShape();

    const first = computeMapLayout(nodes);
    const second = computeMapLayout(nodes);

    expect(Object.fromEntries(first)).toEqual(Object.fromEntries(second));
  });

  it('places detached nodes clear of the laid-out tree bounding box and of each other', () => {
    const treeDimensions = { width: 100, height: 30 };
    const nodes: LayoutInputNode[] = [
      node('root', '', { isRoot: true, dimensions: treeDimensions }),
      node('child', 'root', { dimensions: treeDimensions }),
      node('orphan1', 'missing', {
        detached: true,
        dimensions: treeDimensions,
      }),
      node('orphan2', 'missing', {
        detached: true,
        dimensions: treeDimensions,
      }),
    ];

    const coords = computeMapLayout(nodes);
    const treeBoxes = ['root', 'child'].map(id => ({
      ...coords.get(id)!,
      ...treeDimensions,
    }));
    const treeMinX = Math.min(...treeBoxes.map(b => b.x - b.width / 2));
    const treeMaxX = Math.max(...treeBoxes.map(b => b.x + b.width / 2));
    const detachedBoxes = ['orphan1', 'orphan2'].map(id => ({
      ...coords.get(id)!,
      ...treeDimensions,
    }));
    const allClearOfTree = detachedBoxes.every(
      b => b.x - b.width / 2 > treeMaxX || b.x + b.width / 2 < treeMinX
    );

    expect(allClearOfTree).toBe(true);
    expect(findAnyAABBOverlap(detachedBoxes)).toBeNull();
  });

  /**
   * An imported snapshot carries `name` and `font` but never `dimensions` -
   * those are measured from the DOM after rendering - so the layout has to
   * estimate the size a node will be drawn at.
   */
  describe('when the snapshot carries no measured dimensions', () => {
    const FONT_SIZE = 16;

    /**
     * Deliberately the same estimate the renderer falls back on: the contract
     * under test is "the layout packs for the box that gets drawn", not the
     * numbers the estimate is built from.
     */
    function renderedBox(name: string, fontSize = FONT_SIZE) {
      return estimateNodeExtent(name, fontSize);
    }

    const SUBTOPIC_LABEL = 'A reasonably long AI subtopic label';

    /** Labels but no measured boxes, exactly as an import arrives. */
    function labelledAiShape(): LayoutInputNode[] {
      return buildAiShape((branch, index) => {
        if (branch === undefined) {
          return { name: 'Central topic', font: { size: 20 } };
        }
        const name =
          index === undefined
            ? `Topic ${branch}`
            : `${SUBTOPIC_LABEL} ${index}`;

        return { name, font: { size: FONT_SIZE } };
      });
    }

    it('leaves room for the size the nodes will actually be rendered at', () => {
      const nodes = labelledAiShape();

      const coords = computeMapLayout(nodes);

      const boxes = nodes.map(n => ({
        ...coords.get(n.id)!,
        ...renderedBox(n.name!, n.font!.size),
      }));
      expect(findAnyAABBOverlap(boxes)).toBeNull();
    });

    it('separates long single-line siblings by their rendered height plus the gap', () => {
      const nodes = labelledAiShape();

      const coords = computeMapLayout(nodes);

      const subtopic = nodes.find(n => n.id === 'A1')!;
      const gap = Math.abs(coords.get('A1')!.y - coords.get('A2')!.y);
      expect(gap).toBeCloseTo(
        renderedBox(subtopic.name!).height + VERTICAL_GAP
      );
    });

    it('gives a multi-line label more vertical room than a single-line one', () => {
      // Siblings under a shared parent: two root children would each be
      // centred on the root and so always come out at the same y.
      const nodes: LayoutInputNode[] = [
        { id: 'root', parent: '', isRoot: true, name: 'Root' },
        { id: 'tallParent', parent: 'root', name: 'tall branch' },
        {
          id: 'tall',
          parent: 'tallParent',
          name: 'one\ntwo\nthree\nfour',
          font: { size: 16 },
        },
        {
          id: 'tall2',
          parent: 'tallParent',
          name: 'one\ntwo\nthree\nfour',
          font: { size: 16 },
        },
        { id: 'shortParent', parent: 'root', name: 'short branch' },
        { id: 'short', parent: 'shortParent', name: 'a', font: { size: 16 } },
        { id: 'short2', parent: 'shortParent', name: 'b', font: { size: 16 } },
      ];

      const coords = computeMapLayout(nodes);

      const tallGap = Math.abs(coords.get('tall')!.y - coords.get('tall2')!.y);
      const shortGap = Math.abs(
        coords.get('short')!.y - coords.get('short2')!.y
      );
      expect(tallGap).toBeGreaterThan(shortGap);
    });

    it('prefers a measured dimension over an estimate when one is present', () => {
      const label = 'a very long label that would estimate wide';
      const measured = { width: 60, height: 40 };
      // Siblings under a shared parent again: as root children they would be
      // centred on the root, and a gap of zero would satisfy any upper bound.
      const nodes: LayoutInputNode[] = [
        { id: 'root', parent: '', isRoot: true, name: 'Root' },
        { id: 'branch', parent: 'root', name: 'branch' },
        { id: 'a', parent: 'branch', name: label, dimensions: measured },
        { id: 'b', parent: 'branch', name: label, dimensions: measured },
      ];

      const coords = computeMapLayout(nodes);

      // The 40px measured box wins over the 55px the label would estimate to,
      // so the siblings sit 40 + 20 apart rather than 55 + 20.
      const gap = Math.abs(coords.get('a')!.y - coords.get('b')!.y);
      expect(gap).toBeCloseTo(measured.height + VERTICAL_GAP);
      expect(gap).toBeLessThan(renderedBox(label).height + VERTICAL_GAP);
    });
  });

  describe('degenerate geometry', () => {
    it('produces finite coordinates when a dimension is Infinity', () => {
      const nodes: LayoutInputNode[] = [
        {
          id: 'root',
          parent: '',
          isRoot: true,
          dimensions: { width: Infinity, height: 30 },
        },
        {
          id: 'a',
          parent: 'root',
          dimensions: { width: Infinity, height: 30 },
        },
      ];

      const coords = computeMapLayout(nodes);

      const allFinite = [...coords.values()].every(
        c => Number.isFinite(c.x) && Number.isFinite(c.y)
      );
      expect(allFinite).toBe(true);
    });

    it('produces finite coordinates when the root anchor is NaN', () => {
      const nodes: LayoutInputNode[] = [
        {
          id: 'root',
          parent: '',
          isRoot: true,
          coordinates: { x: NaN, y: NaN },
        },
        { id: 'a', parent: 'root' },
      ];

      const coords = computeMapLayout(nodes);

      const allFinite = [...coords.values()].every(
        c => Number.isFinite(c.x) && Number.isFinite(c.y)
      );
      expect(allFinite).toBe(true);
    });

    // Zero and negative are the two boundary values of one guard - the
    // `width > 0` test the module applies before trusting a dimension.
    it.each([
      ['zero', { width: 0, height: 0 }],
      ['negative', { width: -100, height: -50 }],
    ])(
      'falls back to the default size when a dimension is %s',
      (_label, bad) => {
        const nodes: LayoutInputNode[] = [
          node('root', '', { isRoot: true, dimensions: bad as Dimensions }),
          node('branch', 'root', { dimensions: bad as Dimensions }),
          node('a', 'branch', { dimensions: bad as Dimensions }),
          node('b', 'branch', { dimensions: bad as Dimensions }),
        ];

        const coords = computeMapLayout(nodes);

        // Fed straight through, such a height would pull the siblings back
        // together; the 30px default box is used instead.
        expect(Math.abs(coords.get('a')!.y - coords.get('b')!.y)).toBeCloseTo(
          DEFAULT_BOX.height + VERTICAL_GAP
        );
      }
    );
  });

  /**
   * The layout has no notion of a collapsed branch - `LayoutInputNode` carries
   * no visibility flag - so the guarantee is only that every child in a long
   * run gets its full height, hidden or not.
   */
  it('gives every child in a long sibling run its full height', () => {
    const tall = { width: 100, height: 100 };
    const nodes: LayoutInputNode[] = [
      { id: 'root', parent: '', isRoot: true, coordinates: { x: 0, y: 0 } },
      { id: 'branch', parent: 'root', coordinates: { x: -200, y: 0 } },
      { id: 'other', parent: 'root', coordinates: { x: -200, y: 100 } },
      // Needs a child of its own: d3 only pushes two branches apart where
      // both actually occupy the same depth.
      { id: 'otherChild', parent: 'other', dimensions: tall },
    ];
    for (let i = 1; i <= 6; i++) {
      nodes.push({ id: `c${i}`, parent: 'branch', dimensions: tall });
    }

    const coords = computeMapLayout(nodes);

    const childYs = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'].map(
      id => coords.get(id)!.y
    );
    const gaps = childYs
      .slice(1)
      .map((y, index) => Math.abs(y - childYs[index]));
    expect(Math.min(...gaps)).toBeCloseTo(tall.height + VERTICAL_GAP);
  });

  describe('detached nodes', () => {
    it('leaves an already-positioned detached node where the user put it', () => {
      const nodes: LayoutInputNode[] = [
        { id: 'root', parent: '', isRoot: true, coordinates: { x: 0, y: 0 } },
        {
          id: 'note',
          parent: '',
          detached: true,
          coordinates: { x: 900, y: -400 },
        },
      ];

      const coords = computeMapLayout(nodes);

      expect(coords.get('note')).toEqual({ x: 900, y: -400 });
    });
  });

  it('lays out the first node carrying a duplicated id and ignores the rest', () => {
    const firstBox = { width: 100, height: 200 };
    const secondBox = { width: 100, height: 20 };
    const nodes: LayoutInputNode[] = [
      node('root', '', { isRoot: true }),
      node('branch', 'root'),
      node('dup', 'branch', { dimensions: firstBox }),
      node('dup', 'branch', { dimensions: secondBox }),
      node('sibling', 'branch', { dimensions: secondBox }),
      node('leaf', 'dup'),
    ];

    const coords = computeMapLayout(nodes);

    // Room is reserved for the first record's 200px box. Had the second won,
    // two 20px boxes would have been packed 40px apart instead.
    expect(
      Math.abs(coords.get('dup')!.y - coords.get('sibling')!.y)
    ).toBeCloseTo(firstBox.height / 2 + secondBox.height / 2 + VERTICAL_GAP);
  });

  it('lays out a deep single chain with no overlap, one column further per level', () => {
    const dimensions = DEFAULT_BOX;
    const chain = ['root', 'a', 'b', 'c', 'd'];
    const nodes: LayoutInputNode[] = [
      node('root', '', { isRoot: true, dimensions }),
      node('a', 'root', { dimensions }),
      node('b', 'a', { dimensions }),
      node('c', 'b', { dimensions }),
      node('d', 'c', { dimensions }),
    ];

    const coords = computeMapLayout(nodes);
    const rootX = coords.get('root')!.x;
    const distancesFromRoot = chain.map(id =>
      Math.abs(coords.get(id)!.x - rootX)
    );
    // Narrow enough boxes that no column has to widen, so the step is exactly
    // one column per level.
    expect(distancesFromRoot).toEqual(
      chain.map((_id, depth) => depth * NODE_HORIZONTAL_SPACING)
    );

    const boxes = chain.map(id => ({ ...coords.get(id)!, ...dimensions }));
    expect(findAnyAABBOverlap(boxes)).toBeNull();
  });
});
