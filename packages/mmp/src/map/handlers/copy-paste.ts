import MmpMap from '../map.js';
import { collectSubtreeIds } from '@teammapper/shared';
import type {
  ExportNodeProperties,
  MapNodeCoordinates,
  UserNodeProperties,
} from '@teammapper/shared';
import Log from '../../utils/log.js';
import Utils from '../../utils/utils.js';
import type { ResolvedNode } from '../data/node-record.js';
import { lookupIn, type RecordLookup } from './nodes.js';
import type { Bounds } from './node-geometry.js';
import { moveBounds, unionBounds } from './tree-placement.js';

const ORIGIN: MapNodeCoordinates = { x: 0, y: 0 };

/**
 * Copy, cut and paste branches through the mmp clipboard. The clipboard
 * holds copies of the copied records, so a later change of the map leaves
 * it as it was.
 */
export default class CopyPaste {
  private map: MmpMap;

  private copiedNodes: ExportNodeProperties[] = [];

  // The x of the copied tree's root at copy time. A cut removes the copied
  // nodes, so paste cannot look the root up on the map.
  private copiedTreeRootX = 0;

  // The bounding box of the copied nodes relative to the copied node, read at
  // copy time, while the browser still holds their measured sizes. Null until
  // the first copy.
  private copiedFootprint: Bounds | null = null;

  // Whether the running paste adds a tree. A tree paste makes the copied node
  // the root, so old sides count from that node instead of the old tree root.
  private pastingTree = false;

  /**
   * Get the associated map instance.
   * @param {MmpMap} map
   */
  constructor(map: MmpMap) {
    this.map = map;
  }

  /**
   * Copy the node with the id passed as parameter or
   * the selected node in the mmp clipboard.
   * @param {string} id
   */
  public copy = (id?: string) => {
    const node = this.map.nodes.getTargetNode(id);
    if (!node) return;

    if (!node.isRoot) {
      this.copyToClipboard(node);
    } else {
      Log.error('The root node can not be copied');
    }
  };

  /**
   * Remove and copy the node with the id passed as parameter or
   * the selected node in the mmp clipboard. The method refuses a branch that
   * is or holds a protected node and announces the refusal.
   * @param {string} id
   * @returns {boolean} true when the method cut the node
   */
  public cut = (id?: string): boolean => {
    const node = this.map.nodes.getTargetNode(id);
    if (!node) return false;

    if (node.isRoot) return Log.error('The root node can not be cut');
    if (this.map.nodes.refusesRemoval(node.id)) return false;

    this.copyToClipboard(node);
    this.map.nodes.removeNode(node.id);
    return true;
  };

  /**
   * Write copies of a node and its descendants to the mmp clipboard,
   * together with the x of the root of its tree.
   * @param {ResolvedNode} node
   */
  private copyToClipboard(node: ResolvedNode) {
    const nodes = this.map.nodes;
    const records = nodes.scan();
    const lookup = lookupIn(records);
    const copied = [
      node,
      ...collectSubtreeIds([...records.values()], node.id).flatMap(
        id => records.get(id) ?? []
      ),
    ];

    this.copiedNodes = copied.map(record => Utils.cloneObject(record));
    this.copiedTreeRootX = nodes.positionOf(
      nodes.treeRoot(node.id, lookup),
      lookup
    ).x;
    this.copiedFootprint = this.footprintOf(copied, node.coordinates);
  }

  /** The bounding box of `nodes` relative to `origin`. */
  private footprintOf(nodes: ResolvedNode[], origin: MapNodeCoordinates) {
    return nodes
      .map(node =>
        moveBounds(this.map.nodes.boundsOf(node), {
          x: -origin.x,
          y: -origin.y,
        })
      )
      .reduce(unionBounds);
  }

  /**
   * If there are nodes in the mmp clipboard paste them in the map as children
   * of the node with the passed as parameter or of the selected node.
   * @param {string} id
   */
  public paste = (id?: string) => {
    this.requireCopiedNodes();

    const node = this.map.nodes.getTargetNode(id);
    if (!node) return;

    if (this.map.nodes.refusesChange(node.id)) return;

    this.pasteInto(node.id);
  };

  /**
   * Paste the nodes of the mmp clipboard as an independent tree, whatever
   * node is selected. `newTreeCoordinates` places the root so that the whole
   * pasted tree stays clear of the other trees, and the view then pans to
   * show the whole pasted tree. The selection stays as it was: the frontend
   * pastes as a tree only while nothing is selected, so a second paste adds
   * another tree instead of nesting the copy under the first one.
   */
  public pasteTree = () => {
    const footprint = this.requireCopiedFootprint();

    const root = this.pasteInto(null);
    this.map.zoom.panIntoView(moveBounds(footprint, root.coordinates));
  };

  private requireCopiedNodes() {
    if (this.copiedNodes.length === 0) {
      Log.error('There are not nodes in the mmp clipboard');
    }
  }

  /** The footprint of the copied nodes. Throws when nothing is copied. */
  private requireCopiedFootprint(): Bounds {
    this.requireCopiedNodes();
    const footprint = this.copiedFootprint;
    if (!footprint) Log.error('There are not nodes in the mmp clipboard');

    return footprint;
  }

  /**
   * Add the copied nodes under `parent`, or as a new tree for null, in one
   * write. The records are built first, each placed against the records
   * built before it. Returns the record pasted in place of the copied node.
   */
  private pasteInto(parent: string | null): ResolvedNode {
    this.pastingTree = parent === null;
    const pasted = new Map<string, ResolvedNode>();
    const lookup: RecordLookup = id =>
      pasted.get(id) ?? this.map.nodes.record(id);

    const pastedNode = this.addCopiedNode(
      this.copiedNodes[0],
      parent,
      pasted,
      lookup,
      new Set()
    );
    // The batch makes the paste one undo step of its own, apart from an
    // edit right before or after it.
    const data = this.map.data;
    data.batch(() => data.addNodes([...pasted.values()]));

    return pastedNode;
  }

  /**
   * Build the record of a copied node under `newParent`, then those of its
   * copied children under the record just built. Returns that record.
   * `visited` holds the copied ids built so far, so a parent cycle among the
   * copied nodes ends at the node that closes it.
   */
  private addCopiedNode(
    nodeProperties: ExportNodeProperties,
    newParent: string | null,
    pasted: Map<string, ResolvedNode>,
    lookup: RecordLookup,
    visited: Set<string>
  ): ResolvedNode {
    visited.add(nodeProperties.id);
    const record = this.map.nodes.newRecord(
      this.pastedProperties(nodeProperties, newParent, lookup),
      newParent,
      undefined,
      lookup
    );
    pasted.set(record.id, record);

    this.getChildrenInCopiedNodes(nodeProperties.id)
      .filter(child => !visited.has(child.id))
      .forEach(child =>
        this.addCopiedNode(child, record.id, pasted, lookup, visited)
      );

    return record;
  }

  /**
   * The properties a pasted node gets. Every pasted node gets
   * `isRoot = false` and starts unprotected, whatever the copied node
   * carried.
   */
  private pastedProperties(
    nodeProperties: ExportNodeProperties,
    newParent: string | null,
    lookup: RecordLookup
  ): UserNodeProperties {
    const copy = Utils.cloneObject(nodeProperties);
    const branch = this.pastedBranchColor(newParent, lookup);

    return {
      name: copy.name,
      coordinates: this.pastedCoordinates(nodeProperties, newParent, lookup),
      image: copy.image,
      colors: { ...copy.colors, branch },
      font: copy.font,
      protected: false,
      isRoot: false,
    };
  }

  /**
   * A pasted root gets branch color `''`, because the map draws no branch to a
   * root node. A pasted child takes its new parent's branch color, or the
   * default one.
   */
  private pastedBranchColor(
    newParent: string | null,
    lookup: RecordLookup
  ): string {
    if (newParent === null) return '';

    return (
      lookup(newParent)?.colors.branch ||
      this.map.options.defaultNode.colors.branch
    );
  }

  /**
   * The coordinates of a pasted node:
   * - a pasted root takes `newTreeCoordinates()` for the footprint of the
   *   copied nodes
   * - the first node pasted under a parent takes `undefined`, and
   *   `newRecord` places it
   * - every other node keeps its offset to its own copied parent
   */
  private pastedCoordinates(
    nodeProperties: ExportNodeProperties,
    newParent: string | null,
    lookup: RecordLookup
  ): MapNodeCoordinates | undefined {
    if (newParent === null) {
      return this.map.nodes.newTreeCoordinates(this.requireCopiedFootprint());
    }
    if (nodeProperties.id === this.copiedNodes[0].id) return undefined;

    return this.calculatePastedCoordinates(nodeProperties, newParent, lookup);
  }

  /**
   * Keep the offset a copied node had to its old parent, mirrored when the new
   * parent is on the other side of its tree root.
   * @param {ExportNodeProperties} nodeProperties
   * @param {string} newParent
   * @returns {MapNodeCoordinates} coordinates
   */
  private calculatePastedCoordinates(
    nodeProperties: ExportNodeProperties,
    newParent: string,
    lookup: RecordLookup
  ): MapNodeCoordinates {
    const oldParentNode = this.findInCopiedNodes(nodeProperties.parent);
    const oldParent = oldParentNode?.coordinates ?? ORIGIN;
    const node = nodeProperties.coordinates ?? ORIGIN;
    const newParentPosition = this.map.nodes.positionOf(newParent, lookup);

    // Only a pasted tree has a root as a new parent. The root has no side,
    // and its children keep the sides they had.
    const oldTreeRootX = this.pastingTree
      ? (this.copiedNodes[0].coordinates?.x ?? 0)
      : this.copiedTreeRootX;
    const newSide = this.map.nodes.orientation(newParent, lookup);
    const mirrored =
      newSide !== undefined && oldParent.x < oldTreeRootX !== newSide;
    const dx = mirrored ? node.x - oldParent.x : oldParent.x - node.x;

    return this.map.nodes.fixCoordinates(
      {
        x: newParentPosition.x - dx,
        y: newParentPosition.y - (oldParent.y - node.y),
      },
      true
    );
  }

  private findInCopiedNodes = (
    id: string | null
  ): ExportNodeProperties | undefined => {
    return this.copiedNodes.find(copiedNode => {
      return copiedNode.id === id;
    });
  };

  private getChildrenInCopiedNodes = (id: string): ExportNodeProperties[] => {
    return this.copiedNodes.filter(copiedNode => {
      return copiedNode.parent === id;
    });
  };
}
