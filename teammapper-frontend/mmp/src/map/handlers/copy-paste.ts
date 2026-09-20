import Map from '../map';
import Node from '../models/node';
import type {
  ExportNodeProperties,
  MapNodeColors,
  MapNodeCoordinates,
} from '@teammapper/shared';
import Log from '../../utils/log';
import Utils from '../../utils/utils';
import { Event } from './events';

const ORIGIN: MapNodeCoordinates = { x: 0, y: 0 };

/**
 * Manage the drag events of the nodes.
 */
export default class CopyPaste {
  private map: Map;

  private copiedNodes: ExportNodeProperties[];

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
    if (id && typeof id !== 'string') {
      Log.error('The node id must be a string', 'type');
    }

    const node = id
      ? this.map.nodes.getNode(id)
      : this.map.nodes.getSelectedNode();

    if (node === undefined) {
      Log.error('There are no nodes with id "' + id + '"');
    }

    if (!node.isRoot) {
      this.copiedNodes = [this.map.nodes.getNodeProperties(node, false)];

      this.map.nodes.getDescendants(node).forEach((node: Node) => {
        this.copiedNodes.push(this.map.nodes.getNodeProperties(node, false));
      });
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
    if (id && typeof id !== 'string') {
      Log.error('The node id must be a string', 'type');
    }

    const node = id
      ? this.map.nodes.getNode(id)
      : this.map.nodes.getSelectedNode();

    if (node === undefined) {
      Log.error('There are no nodes with id "' + id + '"');
    }

    if (!node.isRoot) {
      this.copiedNodes = [this.map.nodes.getNodeProperties(node, false)];

      this.map.nodes.getDescendants(node).forEach((node: Node) => {
        this.copiedNodes.push(this.map.nodes.getNodeProperties(node, false));
      });

      this.map.nodes.removeNode(node.id);
    } else {
      Log.error('The root node can not be cut');
    }
  };

  /**
   * If there are nodes in the mmp clipboard paste them in the map as children
   * of the node with the passed as parameter or of the selected node.
   * @param {string} id
   */
  public paste = (id?: string) => {
    if (this.copiedNodes === undefined) {
      Log.error('There are not nodes in the mmp clipboard');
    }

    if (id && typeof id !== 'string') {
      Log.error('The node id must be a string', 'type');
    }

    const node = id
      ? this.map.nodes.getNode(id)
      : this.map.nodes.getSelectedNode();

    if (node === undefined) {
      Log.error('There are no nodes with id "' + id + '"');
    }

    const newNodes = new Array<Node>();

    const addNodes = (
      nodeProperties: ExportNodeProperties,
      newParentNode: Node
    ) => {
      // The new parent places the initial node. The rest keep the offset
      // they had to their own parent in the copied subtree.
      const coordinates =
        nodeProperties.id === this.copiedNodes[0].id
          ? undefined
          : this.calculatePastedCoordinates(nodeProperties, newParentNode);

      const nodePropertiesCopy = Utils.cloneObject(nodeProperties);
      // use the new parents branch color
      const branch = !newParentNode?.colors?.branch
        ? this.map.options.defaultNode.colors.branch
        : newParentNode.colors.branch;
      const fixedColors: MapNodeColors = Object.assign(
        {},
        nodePropertiesCopy.colors,
        {
          branch,
        }
      );

      const createdNode = this.map.nodes.addNode(
        {
          name: nodePropertiesCopy.name,
          coordinates,
          image: nodePropertiesCopy.image,
          colors: fixedColors,
          font: nodePropertiesCopy.font,
          locked: nodePropertiesCopy.locked,
          isRoot: nodePropertiesCopy.isRoot,
        },
        false,
        false,
        newParentNode.id
      );

      newNodes.push(createdNode);

      // get children on first level of the copiedNodes (that are no longer exisiting on the map)
      const children = this.getChildrenInCopiedNodes(nodeProperties.id);

      // If there are children add them.
      if (children.length > 0) {
        children.forEach((np: ExportNodeProperties) => {
          addNodes(np, createdNode);
        });
      }
    };

    addNodes(this.copiedNodes[0], node);

    this.map.draw.clear();
    this.map.draw.update();

    this.map.history.save();

    this.map.events.call(
      Event.nodePaste,
      node.dom,
      newNodes.map(node => this.map.nodes.getNodeProperties(node))
    );
  };

  /**
   * Keep the offset a copied node had to its old parent, mirrored when the new
   * parent sits on the other side of the root.
   * @param {ExportNodeProperties} nodeProperties
   * @param {Node} newParentNode
   * @returns {MapNodeCoordinates} coordinates
   */
  private calculatePastedCoordinates(
    nodeProperties: ExportNodeProperties,
    newParentNode: Node
  ): MapNodeCoordinates {
    const rootNode = this.map.nodes.getRoot();
    const oldParentNode = this.findInCopiedNodes(nodeProperties.parent);
    const oldParent = oldParentNode?.coordinates ?? ORIGIN;
    const node = nodeProperties.coordinates ?? ORIGIN;

    // The root reports no orientation, so a paste onto it always mirrors.
    const mirrored =
      oldParent.x < rootNode.coordinates.x !==
      this.map.nodes.getOrientation(newParentNode);
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
