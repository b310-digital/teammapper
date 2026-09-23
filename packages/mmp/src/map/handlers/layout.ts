import { stratify, tree, HierarchyPointNode } from 'd3';
import type {
  MapNodeCoordinates,
  MapNodeDimensions,
  MapNodeFont,
} from '@teammapper/shared';
import {
  NODE_HORIZONTAL_SPACING,
  estimateNodeExtent,
} from './node-geometry.js';

/**
 * Derives every coordinate at once from the tree. The placement a node gets
 * when it is created only knows about its parent and its immediate siblings,
 * and so cannot account for how much room a whole subtree needs.
 *
 * Since x is purely a function of depth, the packing reduces to one-dimensional
 * interval packing in y. `d3.tree` does that packing, and `separation` feeds it
 * each node's extent.
 */

export interface LayoutInputNode {
  id: string;
  parent: string | null;
  isRoot?: boolean;
  detached?: boolean;
  name?: string | null;
  font?: Pick<MapNodeFont, 'size'>;
  coordinates?: MapNodeCoordinates;
  dimensions?: MapNodeDimensions;
}

const VERTICAL_GAP = 20;
const COLUMN_PADDING = VERTICAL_GAP;
const DEFAULT_NODE_HEIGHT = 30;
const DEFAULT_NODE_WIDTH = 100;
const DEFAULT_FONT_SIZE = 16;

/** A flat {id, parentId} record, the shape `d3.stratify` consumes. */
interface StratifyRecord {
  id: string;
  parentId: string | null;
}

interface Sides {
  left: LayoutInputNode[];
  right: LayoutInputNode[];
}

/**
 * One tree's share of the layout: its root, the anchor the root stays on, the
 * depth of each node in the tree, and the column offset of each depth.
 */
interface TreePass {
  root: LayoutInputNode;
  anchor: MapNodeCoordinates;
  depths: Map<string, number>;
  offsets: number[];
}

function isMeasured(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function finiteOrZero(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * A root other than the main root keeps its coordinates only when both axes
 * are finite. The main root instead takes each finite axis and zero for the
 * other, as it did before trees existed, so a single-tree map keeps its
 * layout. Only a malformed snapshot can mix the two, since the stored
 * coordinate columns are NOT NULL.
 */
function hasPosition(
  coordinates: MapNodeCoordinates | undefined
): coordinates is MapNodeCoordinates {
  return (
    !!coordinates &&
    Number.isFinite(coordinates.x) &&
    Number.isFinite(coordinates.y)
  );
}

/**
 * The main root, then every other parentless node that is not detached. The
 * layout starts no tree at a detached node and parks it with the orphans.
 */
function findTreeRoots(nodes: LayoutInputNode[]): LayoutInputNode[] {
  const roots = nodes.filter(
    node => node.isRoot || (!node.parent && !node.detached)
  );
  return [
    ...roots.filter(root => root.isRoot),
    ...roots.filter(root => !root.isRoot),
  ];
}

export function computeMapLayout(
  nodes: LayoutInputNode[]
): Map<string, MapNodeCoordinates> {
  return new MapLayout(nodes).build();
}

class MapLayout {
  private readonly byId = new Map<string, LayoutInputNode>();
  private readonly childrenOf = new Map<string, LayoutInputNode[]>();
  /** Depth of every node a root reaches, across all trees. */
  private readonly depthOf = new Map<string, number>();
  private readonly extents = new Map<string, MapNodeDimensions>();
  private readonly coordinates = new Map<string, MapNodeCoordinates>();
  private readonly nodes: LayoutInputNode[];
  private readonly roots: LayoutInputNode[];
  private readonly mainAnchor: MapNodeCoordinates;

  constructor(nodes: LayoutInputNode[]) {
    this.nodes = this.dedupeById(nodes);
    this.roots = findTreeRoots(this.nodes);
    this.mainAnchor = {
      x: finiteOrZero(this.roots[0]?.coordinates?.x),
      y: finiteOrZero(this.roots[0]?.coordinates?.y),
    };
  }

  /**
   * A duplicated id makes the hierarchy ambiguous and would abort the whole
   * layout, so only the first node carrying each id is laid out. Snapshots are
   * validated for id format on import but never for uniqueness.
   */
  private dedupeById(nodes: LayoutInputNode[]): LayoutInputNode[] {
    for (const node of nodes) {
      if (!this.byId.has(node.id)) this.byId.set(node.id, node);
    }
    return Array.from(this.byId.values());
  }

  public build(): Map<string, MapNodeCoordinates> {
    if (this.nodes.length === 0) return this.coordinates;

    this.indexChildren();
    this.layoutTrees();
    this.placeDetachedNodes();

    return this.coordinates;
  }

  /**
   * The main root keeps its coordinates, or anchors at (0, 0) when it has
   * none. Every other root with coordinates keeps them. The engine places a
   * root without coordinates, as a Mermaid import produces, right of the trees
   * placed before it.
   */
  private layoutTrees(): void {
    const [main, ...others] = this.roots;
    if (!main) return;

    this.layoutTree(main, this.mainAnchor);
    const unplaced: LayoutInputNode[] = [];
    for (const root of others) {
      if (hasPosition(root.coordinates))
        this.layoutTree(root, root.coordinates);
      else unplaced.push(root);
    }
    for (const root of unplaced) this.layoutRightOfPlacedTrees(root);
  }

  /**
   * Lays the tree out around x = 0, level with the main root, then shifts the
   * tree so its left edge ends one NODE_HORIZONTAL_SPACING right of the placed
   * trees. A child with coordinates picks its side against that provisional
   * x = 0 anchor. Only a map with partial coordinates reaches that case, since
   * a Mermaid import carries none.
   */
  private layoutRightOfPlacedTrees(root: LayoutInputNode): void {
    const edge = this.treeRightEdge();
    const ids = this.layoutTree(root, { x: 0, y: this.mainAnchor.y });
    const shift = edge + NODE_HORIZONTAL_SPACING - this.edgeOf(ids, -1);

    for (const id of ids) {
      const placed = this.coordinates.get(id);
      if (placed)
        this.coordinates.set(id, { x: placed.x + shift, y: placed.y });
    }
  }

  /** The single-tree pass: returns the ids of every node it placed. */
  private layoutTree(
    root: LayoutInputNode,
    anchor: MapNodeCoordinates
  ): string[] {
    const pass = this.createPass(root, anchor);
    for (const [id, depth] of pass.depths) this.depthOf.set(id, depth);

    this.coordinates.set(root.id, { x: anchor.x, y: anchor.y });
    const { left, right } = this.splitSides(pass);
    this.layoutSide(pass, left, -1);
    this.layoutSide(pass, right, 1);
    return [...pass.depths.keys()];
  }

  private createPass(
    root: LayoutInputNode,
    anchor: MapNodeCoordinates
  ): TreePass {
    const depths = this.indexDepths(root);
    return { root, anchor, depths, offsets: this.columnOffsets(depths) };
  }

  private extentOf(node: LayoutInputNode): MapNodeDimensions {
    const cached = this.extents.get(node.id);
    if (cached) return cached;

    const estimated = this.estimateExtent(node);
    const extent: MapNodeDimensions = {
      width: isMeasured(node.dimensions?.width)
        ? node.dimensions.width
        : estimated.width,
      height: isMeasured(node.dimensions?.height)
        ? node.dimensions.height
        : estimated.height,
    };
    this.extents.set(node.id, extent);

    return extent;
  }

  private estimateExtent(node: LayoutInputNode): MapNodeDimensions {
    if (node.name === undefined || node.name === null) {
      return { width: DEFAULT_NODE_WIDTH, height: DEFAULT_NODE_HEIGHT };
    }
    const fontSize =
      typeof node.font?.size === 'number' && isMeasured(node.font.size)
        ? node.font.size
        : DEFAULT_FONT_SIZE;

    return estimateNodeExtent(node.name, fontSize);
  }

  private heightOf(node: LayoutInputNode): number {
    return this.extentOf(node).height;
  }

  private widthOf(node: LayoutInputNode): number {
    return this.extentOf(node).width;
  }

  /**
   * A node pointing at itself or at a missing parent is left out, so it falls
   * through to the parking column instead of breaking the hierarchy.
   */
  private indexChildren(): void {
    for (const node of this.nodes) {
      if (node.isRoot || node.detached) continue;
      if (
        !node.parent ||
        node.parent === node.id ||
        !this.byId.has(node.parent)
      )
        continue;
      const siblings = this.childrenOf.get(node.parent) ?? [];
      siblings.push(node);
      this.childrenOf.set(node.parent, siblings);
    }
  }

  /** Breadth-first depth of every node in the tree under `root`. */
  private indexDepths(root: LayoutInputNode): Map<string, number> {
    const depths = new Map([[root.id, 0]]);
    // The queue grows while it is being walked; an array iterator picks up
    // whatever has been appended, which is what makes this breadth-first.
    const queue: LayoutInputNode[] = [root];
    for (const parent of queue) {
      const depth = (depths.get(parent.id) ?? 0) + 1;
      for (const child of this.childrenOf.get(parent.id) ?? []) {
        if (depths.has(child.id)) continue;
        depths.set(child.id, depth);
        queue.push(child);
      }
    }
    return depths;
  }

  /** Total height of a subtree, used only to balance the two sides. */
  private subtreeWeight(id: string, seen = new Set<string>()): number {
    if (seen.has(id)) return 0;
    seen.add(id);

    const node = this.byId.get(id);
    if (!node) return 0;

    const children = this.childrenOf.get(id) ?? [];
    return children.reduce(
      (weight, child) => weight + this.subtreeWeight(child.id, seen),
      this.heightOf(node)
    );
  }

  private widestPerDepth(depths: Map<string, number>): number[] {
    const widest: number[] = [];
    for (const [id, depth] of depths) {
      const node = this.byId.get(id);
      if (!node) continue;
      widest[depth] = Math.max(widest[depth] ?? 0, this.widthOf(node));
    }
    return widest;
  }

  /**
   * Distance of each depth's column from the root: one NODE_HORIZONTAL_SPACING
   * at least, and more when the widest label at either depth would otherwise
   * spill into the neighbouring column.
   */
  private columnOffsets(depths: Map<string, number>): number[] {
    const widest = this.widestPerDepth(depths);
    const offsets = [0];

    for (let depth = 1; depth < widest.length; depth++) {
      const needed = (widest[depth - 1] + widest[depth]) / 2 + COLUMN_PADDING;
      offsets[depth] =
        offsets[depth - 1] + Math.max(NODE_HORIZONTAL_SPACING, needed);
    }
    return offsets;
  }

  /**
   * Split the root's children into a left and a right group. A child keeps the
   * side it already sits on; one with no coordinates yet - every node of a
   * fresh import - goes to whichever side is carrying less.
   */
  private splitSides(pass: TreePass): Sides {
    const sides: Sides = { left: [], right: [] };
    const weights = { left: 0, right: 0 };
    const unsided: LayoutInputNode[] = [];

    for (const child of this.childrenOf.get(pass.root.id) ?? []) {
      const side = this.sideOf(child, pass.anchor);
      if (side) this.assignToSide(child, side, sides, weights);
      else unsided.push(child);
    }

    for (const child of unsided) {
      const lighter = weights.left <= weights.right ? 'left' : 'right';
      this.assignToSide(child, lighter, sides, weights);
    }
    return sides;
  }

  private assignToSide(
    child: LayoutInputNode,
    side: keyof Sides,
    sides: Sides,
    weights: Record<keyof Sides, number>
  ): void {
    sides[side].push(child);
    weights[side] += this.subtreeWeight(child.id);
  }

  /** undefined when the node has no position to derive a side from. */
  private sideOf(
    node: LayoutInputNode,
    anchor: MapNodeCoordinates
  ): keyof Sides | undefined {
    if (!node.coordinates || !Number.isFinite(node.coordinates.x)) {
      return undefined;
    }
    return node.coordinates.x < anchor.x ? 'left' : 'right';
  }

  /**
   * The root plus every descendant on one side, flattened for `stratify`.
   *
   * The walk needs no visited set: deduplicated ids plus a single parent per
   * node mean a cycle can only form a closed component the root cannot reach.
   * Without `dedupeById` this loop would be unbounded.
   */
  private sideRecords(
    root: LayoutInputNode,
    sideChildren: LayoutInputNode[]
  ): StratifyRecord[] {
    const collected = [...sideChildren];
    for (const node of collected) {
      collected.push(...(this.childrenOf.get(node.id) ?? []));
    }

    const rootRecord: StratifyRecord = { id: root.id, parentId: null };
    return [
      rootRecord,
      ...collected.map(node => ({ id: node.id, parentId: node.parent })),
    ];
  }

  /**
   * Distance between two adjacent node centres. `nodeSize`'s cross-axis unit is
   * 1, so this returns pixels directly and taller nodes get a wider gap.
   */
  private separationBetween(
    a: HierarchyPointNode<StratifyRecord>,
    b: HierarchyPointNode<StratifyRecord>
  ): number {
    const half = (id: string) => {
      const node = this.byId.get(id);
      return node ? this.heightOf(node) / 2 : DEFAULT_NODE_HEIGHT / 2;
    };

    return half(a.data.id) + half(b.data.id) + VERTICAL_GAP;
  }

  private layoutSide(
    pass: TreePass,
    sideChildren: LayoutInputNode[],
    sign: number
  ): void {
    if (sideChildren.length === 0) return;

    const records = this.sideRecords(pass.root, sideChildren);
    const hierarchy = stratify<StratifyRecord>()
      .id(record => record.id)
      .parentId(record => record.parentId)(records);
    const laidOut = tree<StratifyRecord>()
      .nodeSize([1, 1])
      .separation((a, b) => this.separationBetween(a, b))(hierarchy);

    // d3 centres each side's root on that side's children; translating by the
    // root's own cross position pins it back onto the anchor.
    const rootCross = laidOut.x;
    laidOut.each(node => this.place(pass, node, sign, rootCross));
  }

  private place(
    pass: TreePass,
    node: HierarchyPointNode<StratifyRecord>,
    sign: number,
    rootCross: number
  ): void {
    const depth = pass.depths.get(node.data.id) ?? 0;
    const offset = pass.offsets[depth] ?? depth * NODE_HORIZONTAL_SPACING;

    this.coordinates.set(node.data.id, {
      x: pass.anchor.x + sign * offset,
      y: pass.anchor.y + finiteOrZero(node.x - rootCross),
    });
  }

  /** Right-hand edge of every laid-out tree, never left of the main root. */
  private treeRightEdge(): number {
    return this.edgeOf(this.depthOf.keys(), 1, this.mainAnchor.x);
  }

  /** Outermost box edge of the placed nodes: `sign` 1 reads right, -1 left. */
  private edgeOf(
    ids: Iterable<string>,
    sign: 1 | -1,
    start = sign * -Infinity
  ): number {
    let edge = start;
    for (const id of ids) {
      const node = this.byId.get(id);
      const placed = this.coordinates.get(id);
      if (!node || !placed) continue;
      const side = placed.x + (sign * this.widthOf(node)) / 2;
      edge = sign === 1 ? Math.max(edge, side) : Math.min(edge, side);
    }
    return edge;
  }

  /**
   * Detached nodes and orphans have no path from a root, so the tree layout
   * has no position for them. The engine keeps a node with coordinates where
   * the user put it and stacks the rest in a column clear of the trees.
   */
  private placeDetachedNodes(): void {
    const unplaced: LayoutInputNode[] = [];

    for (const node of this.nodes) {
      if (this.depthOf.has(node.id)) continue;

      const own = node.coordinates;
      if (hasPosition(own)) {
        this.coordinates.set(node.id, { x: own.x, y: own.y });
      } else {
        unplaced.push(node);
      }
    }
    this.parkInColumn(unplaced);
  }

  private parkInColumn(nodes: LayoutInputNode[]): void {
    if (nodes.length === 0) return;

    const widest = nodes.reduce(
      (max, node) => Math.max(max, this.widthOf(node)),
      0
    );
    const x = this.treeRightEdge() + NODE_HORIZONTAL_SPACING + widest / 2;

    let cursor = this.mainAnchor.y;
    for (const node of nodes) {
      const height = this.heightOf(node);
      this.coordinates.set(node.id, { x, y: cursor + height / 2 });
      cursor += height + VERTICAL_GAP;
    }
  }
}
