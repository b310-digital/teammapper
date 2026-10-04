import Map from '../map.js';
import Node from '../models/node.js';
import { collectSubtreeIds } from '@teammapper/shared';
import type {
  ExportNodeProperties,
  MapNodeCoordinates,
  UserNodeProperties,
} from '@teammapper/shared';
import Log from '../../utils/log.js';
import Utils from '../../utils/utils.js';
import type { ResolvedNode } from '../data/node-record.js';
import type { RecordLookup } from './nodes.js';
import type { Bounds } from './node-geometry.js';
import { moveBounds, unionBounds } from './tree-placement.js';

const ORIGIN: MapNodeCoordinates = { x: 0, y: 0 };

/**
 * Manage the drag events of the nodes.
 */
export default class CopyPaste {
  private map: Map;

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
   * @param {Map} map
   */
  constructor(map: Map) {
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
    if (this.map.nodes.refusesLocalRemoval(node.id)) return false;

    this.copyToClipboard(node);
    this.map.nodes.removeNode(node.id);
    return true;
  };

  /**
   * Write copies of a node and its descendants to the mmp clipboard,
   * together with the x of the root of its tree.
   * @param {Node} node
   */
  private copyToClipboard(node: Node) {
    const nodes = this.map.nodes;
    const records = nodes.scan();
    const lookup: RecordLookup = id => records.get(id);
    const copied = [
      node.id,
      ...collectSubtreeIds([...records.values()], node.id),
    ]
      .map(id => records.get(id))
      .filter((record): record is ResolvedNode => record !== undefined);

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

    if (this.map.nodes.refusesLocalChange(node.id)) return;

    this.pasteInto(node);
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
   * Add the copied nodes under `parent`, or as a new tree for null, and
   * announce them in one paste event. Returns the node pasted in place of the
   * copied node.
   */
  private pasteInto(parent: Node | null): Node {
    this.pastingTree = parent === null;
    const newNodes: Node[] = [];
    const pastedNode = this.addCopiedNode(
      this.copiedNodes[0],
      parent,
      newNodes
    );

    this.map.draw.clear();
    this.map.draw.update();
    this.map.nodes.redrawSelectionRing();

    const pasted = newNodes.map(node => this.map.nodes.getNodeProperties(node));
    this.map.events.emit('nodePaste', pasted);

    return pastedNode;
  }

  /**
   * Add a copied node under `newParentNode`, then its copied children under
   * the node just created. Returns the node just created.
   */
  private addCopiedNode(
    nodeProperties: ExportNodeProperties,
    newParentNode: Node | null,
    newNodes: Node[]
  ): Node {
    const createdNode = this.map.nodes.insertNode(
      this.pastedProperties(nodeProperties, newParentNode),
      newParentNode?.id ?? null
    );
    newNodes.push(createdNode);

    this.getChildrenInCopiedNodes(nodeProperties.id).forEach(child =>
      this.addCopiedNode(child, createdNode, newNodes)
    );

    return createdNode;
  }

  /**
   * The properties a pasted node gets. Every pasted node gets
   * `isRoot = false` and starts unprotected, whatever the copied node
   * carried.
   */
  private pastedProperties(
    nodeProperties: ExportNodeProperties,
    newParentNode: Node | null
  ): UserNodeProperties {
    const copy = Utils.cloneObject(nodeProperties);
    const branch = this.pastedBranchColor(newParentNode);

    return {
      name: copy.name,
      coordinates: this.pastedCoordinates(nodeProperties, newParentNode),
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
  private pastedBranchColor(newParentNode: Node | null): string {
    if (!newParentNode) return '';

    return (
      newParentNode.colors?.branch || this.map.options.defaultNode.colors.branch
    );
  }

  /**
   * The coordinates of a pasted node:
   * - a pasted root takes `newTreeCoordinates()` for the footprint of the
   *   copied nodes
   * - the first node pasted under a parent takes `undefined`, and `addNode`
   *   places it
   * - every other node keeps its offset to its own copied parent
   */
  private pastedCoordinates(
    nodeProperties: ExportNodeProperties,
    newParentNode: Node | null
  ): MapNodeCoordinates | undefined {
    if (!newParentNode) {
      return this.map.nodes.newTreeCoordinates(this.requireCopiedFootprint());
    }
    if (nodeProperties.id === this.copiedNodes[0].id) return undefined;

    return this.calculatePastedCoordinates(nodeProperties, newParentNode);
  }

  /**
   * Keep the offset a copied node had to its old parent, mirrored when the new
   * parent is on the other side of its tree root.
   * @param {ExportNodeProperties} nodeProperties
   * @param {Node} newParentNode
   * @returns {MapNodeCoordinates} coordinates
   */
  private calculatePastedCoordinates(
    nodeProperties: ExportNodeProperties,
    newParentNode: Node
  ): MapNodeCoordinates {
    const oldParentNode = this.findInCopiedNodes(nodeProperties.parent);
    const oldParent = oldParentNode?.coordinates ?? ORIGIN;
    const node = nodeProperties.coordinates ?? ORIGIN;

    // Only a pasted tree has a root as a new parent. The root has no side,
    // and its children keep the sides they had.
    const oldTreeRootX = this.pastingTree
      ? (this.copiedNodes[0].coordinates?.x ?? 0)
      : this.copiedTreeRootX;
    const newSide = this.map.nodes.orientation(newParentNode.id);
    const mirrored =
      newSide !== undefined && oldParent.x < oldTreeRootX !== newSide;
    const dx = mirrored ? node.x - oldParent.x : oldParent.x - node.x;

    return this.map.nodes.fixCoordinates(
      {
        x: newParentNode.coordinates.x - dx,
        y: newParentNode.coordinates.y - (oldParent.y - node.y),
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
