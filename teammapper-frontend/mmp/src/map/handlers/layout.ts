import { stratify, tree, HierarchyPointNode } from 'd3';
import type { Coordinates, Dimensions, Font } from '../models/node';
import { NODE_HORIZONTAL_SPACING, estimateNodeExtent } from './node-geometry';

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
  parent: string;
  isRoot?: boolean;
  detached?: boolean;
  name?: string;
  font?: Pick<Font, 'size'>;
  coordinates?: Coordinates;
  dimensions?: Dimensions;
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

function isMeasured(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function finiteOrZero(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function computeMapLayout(
  nodes: LayoutInputNode[]
): Map<string, Coordinates> {
  return new MapLayout(nodes).build();
}

class MapLayout {
  private readonly byId = new Map<string, LayoutInputNode>();
  private readonly childrenOf = new Map<string, LayoutInputNode[]>();
  private readonly depthOf = new Map<string, number>();
  private readonly extents = new Map<string, Dimensions>();
  private readonly coordinates = new Map<string, Coordinates>();
  private readonly nodes: LayoutInputNode[];
  private readonly root: LayoutInputNode | undefined;
  private readonly anchor: Coordinates;

  constructor(nodes: LayoutInputNode[]) {
    this.nodes = this.dedupeById(nodes);
    this.root = this.nodes.find(node => node.isRoot);
    this.anchor = {
      x: finiteOrZero(this.root?.coordinates?.x),
      y: finiteOrZero(this.root?.coordinates?.y),
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

  public build(): Map<string, Coordinates> {
    if (this.nodes.length === 0) return this.coordinates;

    this.indexChildren();
    this.indexDepths();
    this.layoutTree();
    this.placeDetachedNodes();

    return this.coordinates;
  }

  private layoutTree(): void {
    if (!this.root) return;

    this.coordinates.set(this.root.id, { ...this.anchor });
    const offsets = this.columnOffsets();
    const { left, right } = this.splitSides();
    this.layoutSide(left, -1, offsets);
    this.layoutSide(right, 1, offsets);
  }

  private extentOf(node: LayoutInputNode): Dimensions {
    const cached = this.extents.get(node.id);
    if (cached) return cached;

    const estimated = this.estimateExtent(node);
    const extent: Dimensions = {
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

  private estimateExtent(node: LayoutInputNode): Dimensions {
    if (node.name === undefined) {
      return { width: DEFAULT_NODE_WIDTH, height: DEFAULT_NODE_HEIGHT };
    }
    const fontSize = isMeasured(node.font?.size)
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
   * through to the detached column instead of breaking the hierarchy.
   */
  private indexChildren(): void {
    for (const node of this.nodes) {
      if (node.isRoot || node.detached) continue;
      if (node.parent === node.id || !this.byId.has(node.parent)) continue;
      const siblings = this.childrenOf.get(node.parent) ?? [];
      siblings.push(node);
      this.childrenOf.set(node.parent, siblings);
    }
  }

  /** Breadth-first depth per node; anything unreached is detached. */
  private indexDepths(): void {
    if (!this.root) return;

    this.depthOf.set(this.root.id, 0);
    // The queue grows while it is being walked; an array iterator picks up
    // whatever has been appended, which is what makes this breadth-first.
    const queue: LayoutInputNode[] = [this.root];
    for (const parent of queue) {
      const depth = (this.depthOf.get(parent.id) ?? 0) + 1;
      for (const child of this.childrenOf.get(parent.id) ?? []) {
        if (this.depthOf.has(child.id)) continue;
        this.depthOf.set(child.id, depth);
        queue.push(child);
      }
    }
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

  private widestPerDepth(): number[] {
    const widest: number[] = [];
    for (const [id, depth] of this.depthOf) {
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
  private columnOffsets(): number[] {
    const widest = this.widestPerDepth();
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
  private splitSides(): Sides {
    const sides: Sides = { left: [], right: [] };
    const weights = { left: 0, right: 0 };
    const unsided: LayoutInputNode[] = [];

    for (const child of this.rootChildren()) {
      const side = this.sideOf(child);
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
  private sideOf(node: LayoutInputNode): keyof Sides | undefined {
    if (!node.coordinates || !Number.isFinite(node.coordinates.x)) {
      return undefined;
    }
    return node.coordinates.x < this.anchor.x ? 'left' : 'right';
  }

  private rootChildren(): LayoutInputNode[] {
    return this.root ? (this.childrenOf.get(this.root.id) ?? []) : [];
  }

  /**
   * The root plus every descendant on one side, flattened for `stratify`.
   *
   * The walk needs no visited set: deduplicated ids plus a single parent per
   * node mean a cycle can only form a closed component the root cannot reach.
   * Without `dedupeById` this loop would be unbounded.
   */
  private sideRecords(sideChildren: LayoutInputNode[]): StratifyRecord[] {
    const collected = [...sideChildren];
    for (const node of collected) {
      collected.push(...(this.childrenOf.get(node.id) ?? []));
    }

    const rootRecord: StratifyRecord = {
      id: this.root ? this.root.id : '',
      parentId: null,
    };
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
    sideChildren: LayoutInputNode[],
    sign: number,
    offsets: number[]
  ): void {
    if (sideChildren.length === 0) return;

    const hierarchy = stratify<StratifyRecord>()
      .id(record => record.id)
      .parentId(record => record.parentId)(this.sideRecords(sideChildren));
    const laidOut = tree<StratifyRecord>()
      .nodeSize([1, 1])
      .separation((a, b) => this.separationBetween(a, b))(hierarchy);

    // d3 centres each side's root on that side's children; translating by the
    // root's own cross position pins it back onto the anchor.
    const rootCross = laidOut.x;
    laidOut.each(node => this.place(node, sign, offsets, rootCross));
  }

  private place(
    node: HierarchyPointNode<StratifyRecord>,
    sign: number,
    offsets: number[],
    rootCross: number
  ): void {
    const depth = this.depthOf.get(node.data.id) ?? 0;
    const offset = offsets[depth] ?? depth * NODE_HORIZONTAL_SPACING;

    this.coordinates.set(node.data.id, {
      x: this.anchor.x + sign * offset,
      y: this.anchor.y + finiteOrZero(node.x - rootCross),
    });
  }

  /** Right-hand edge of the laid-out tree, used to park detached nodes clear. */
  private treeRightEdge(): number {
    let edge = this.anchor.x;
    for (const [id] of this.depthOf) {
      const node = this.byId.get(id);
      const placed = this.coordinates.get(id);
      if (!node || !placed) continue;
      edge = Math.max(edge, placed.x + this.widthOf(node) / 2);
    }
    return edge;
  }

  /**
   * Detached nodes have no path from the root, so the tree layout has no
   * position for them. One already placed was put there deliberately and is
   * left alone; the rest are stacked in a column clear of the tree.
   */
  private placeDetachedNodes(): void {
    const unplaced: LayoutInputNode[] = [];

    for (const node of this.nodes) {
      if (this.depthOf.has(node.id)) continue;

      const own = node.coordinates;
      if (own && Number.isFinite(own.x) && Number.isFinite(own.y)) {
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

    let cursor = this.anchor.y;
    for (const node of nodes) {
      const height = this.heightOf(node);
      this.coordinates.set(node.id, { x, y: cursor + height / 2 });
      cursor += height + VERTICAL_GAP;
    }
  }
}
