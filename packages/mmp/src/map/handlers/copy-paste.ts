import Map from '../map.js';
import Node from '../models/node.js';
import type {
  ExportNodeProperties,
  MapNodeCoordinates,
  UserNodeProperties,
} from '@teammapper/shared';
import Log from '../../utils/log.js';
import Utils from '../../utils/utils.js';
import { Event } from './events.js';

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
   * the selected node in the mmp clipboard.
   * @param {string} id
   */
  public cut = (id?: string) => {
    const node = this.map.nodes.getTargetNode(id);
    if (!node) return;

    if (!node.isRoot) {
      this.copyToClipboard(node);

      this.map.nodes.removeNode(node.id);
    } else {
      Log.error('The root node can not be cut');
    }
  };

  /**
   * Write a node and its descendants to the mmp clipboard, together with the
   * x of the root of its tree.
   * @param {Node} node
   */
  private copyToClipboard(node: Node) {
    this.copiedNodes = [node, ...this.map.nodes.getDescendants(node)].map(
      copied => this.map.nodes.getNodeProperties(copied, false)
    );
    this.copiedTreeRootX = this.map.nodes.getTreeRoot(node).coordinates.x;
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

    this.pasteInto(node);
  };

  /**
   * Paste the nodes of the mmp clipboard as an independent tree, its root
   * placed at `newTreeCoordinates`, whatever node is selected.
   */
  public pasteTree = () => {
    this.requireCopiedNodes();

    this.pasteInto(null);
  };

  private requireCopiedNodes() {
    if (this.copiedNodes.length === 0) {
      Log.error('There are not nodes in the mmp clipboard');
    }
  }

  /**
   * Add the copied nodes under `parent`, or as a new tree for null, and
   * announce them in one paste event.
   */
  private pasteInto(parent: Node | null) {
    this.pastingTree = parent === null;
    const newNodes: Node[] = [];
    this.addCopiedNode(this.copiedNodes[0], parent, newNodes);

    this.map.draw.clear();
    this.map.draw.update();
    this.map.history.save();

    const pasted = newNodes.map(node => this.map.nodes.getNodeProperties(node));
    this.map.events.call(Event.nodePaste, parent?.dom, pasted);
  }

  /**
   * Add a copied node under `newParentNode`, then its copied children under
   * the node just created.
   */
  private addCopiedNode(
    nodeProperties: ExportNodeProperties,
    newParentNode: Node | null,
    newNodes: Node[]
  ) {
    const createdNode = this.map.nodes.addNode(
      this.pastedProperties(nodeProperties, newParentNode),
      false,
      false,
      newParentNode?.id ?? null
    );
    newNodes.push(createdNode);

    this.getChildrenInCopiedNodes(nodeProperties.id).forEach(child =>
      this.addCopiedNode(child, createdNode, newNodes)
    );
  }

  /**
   * The properties a pasted node gets. Every pasted node gets
   * `isRoot = false`, whatever the copied node carried.
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
      locked: copy.locked,
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
   * - a pasted root takes `newTreeCoordinates()`
   * - the first node pasted under a parent takes `undefined`, and `addNode`
   *   places it
   * - every other node keeps its offset to its own copied parent
   */
  private pastedCoordinates(
    nodeProperties: ExportNodeProperties,
    newParentNode: Node | null
  ): MapNodeCoordinates | undefined {
    if (!newParentNode) return this.map.nodes.newTreeCoordinates();
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
    const newSide = this.map.nodes.getOrientation(newParentNode);
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
