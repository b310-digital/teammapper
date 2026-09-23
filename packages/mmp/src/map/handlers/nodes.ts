import Node, { NodeProperties } from '../models/node.js';
import MmpMap from '../map.js';
import * as d3 from 'd3';
import DOMPurify from 'dompurify';
import { v4 as uuidv4 } from 'uuid';
import { Event } from './events.js';
import Log from '../../utils/log.js';
import Utils from '../../utils/utils.js';
import { computeMapLayout, LayoutInputNode } from './layout.js';
import { NODE_HORIZONTAL_SPACING } from './node-geometry.js';
import type {
  ExportNodeProperties,
  MapNodeColors,
  MapNodeCoordinates,
  MapNodeFont,
  MapNodeImage,
  MapNodeLink,
  MapSnapshot,
  NodeProperty,
  NodePropertyValue,
  UserNodeProperties,
} from '@teammapper/shared';

const NODE_VERTICAL_SIBLING_OFFSET = 60; // The y-axis spacing between sibling nodes
const NODE_VERTICAL_SPACING = 120; // The initial vertical spacing for the first child node
export const PropertyMapping = {
  name: ['name'],
  locked: ['locked'],
  coordinates: ['coordinates'],
  imageSrc: ['image', 'src'],
  imageSize: ['image', 'size'],
  linkHref: ['link', 'href'],
  backgroundColor: ['colors', 'background'],
  branchColor: ['colors', 'branch'],
  fontWeight: ['font', 'weight'],
  fontStyle: ['font', 'style'],
  fontSize: ['font', 'size'],
  nameColor: ['colors', 'name'],
  hidden: ['hidden'],
} as const;

/**
 * Manage the nodes of the map.
 */
export default class Nodes {
  /**
   * Get the associated map instance and initialize the nodes.
   * @param {MmpMap} map
   */
  constructor(map: MmpMap) {
    this.map = map;

    this.nodes = new Map();
  }
  static NodePropertyMapping: typeof PropertyMapping = PropertyMapping;

  private map: MmpMap;

  private nodes: Map<string, Node>;
  private selectedNode!: Node;

  /**
   * Add the root node to the map.
   * @param {MapNodeCoordinates} coordinates
   */
  public addRootNode(coordinates?: MapNodeCoordinates) {
    const rootId = uuidv4();

    const properties = Utils.mergeObjects(this.map.options.rootNode, {
      coordinates: {
        x: 0,
        y: 0,
      },
      locked: false,
      id: rootId,
      parent: null,
      detached: false,
      hidden: false,
      isRoot: true,
    }) as unknown as NodeProperties;

    this.map.rootId = rootId;

    const node: Node = new Node(properties);

    if (coordinates) {
      node.coordinates.x = coordinates.x || node.coordinates.x;
      node.coordinates.y = coordinates.y || node.coordinates.y;
    }

    this.nodes.set(properties.id, node);

    this.map.draw.update();

    this.selectRootNode();
  }

  /**
   * Add a node in the map.
   * @param {UserNodeProperties} userProperties
   * @param {string | null} parentId the parent's id, null to add a root, or
   * undefined to add a child of the selected node
   * @param {string} overwriteId
   */
  public addNode = (
    userProperties?: UserNodeProperties,
    notifyWithEvent = true,
    updateHistory = true,
    parentId?: string | null,
    overwriteId?: string
  ): Node => {
    const parentNode = this.resolveParent(userProperties, parentId);

    const properties: NodeProperties = Utils.mergeObjects(
      this.map.options.defaultNode,
      userProperties,
      true
    ) as NodeProperties;

    properties.id = overwriteId || uuidv4();
    properties.parent = parentNode;

    // A root draws no branch. Its children fall through to the automatic
    // branch colors, as the main root's children do.
    if (!parentNode && userProperties?.colors?.branch === undefined) {
      properties.colors = { ...properties.colors, branch: '' };
    }

    // A node added to a branch this person hid starts hidden itself, so a node
    // somebody else creates there does not appear on its own.
    if (parentNode && this.hidesChildNodes(parentNode)) {
      properties.hidden = true;
    }

    const node: Node = new Node(properties);

    this.nodes.set(properties.id, node);

    if (
      !properties.coordinates?.x &&
      !properties.coordinates?.y &&
      node.parent
    ) {
      node.coordinates = this.calculateCoordinates(node);
    }

    this.map.draw.update();

    if (updateHistory) {
      this.map.history.save();
    }

    if (notifyWithEvent)
      this.map.events.call(
        Event.nodeCreate,
        node.dom,
        this.getNodeProperties(node)
      );
    return node;
  };

  /**
   * The parent a node added through addNode gets: none for a detached node or
   * an explicit null, the named node for an id, the selected node otherwise.
   */
  private resolveParent(
    userProperties: UserNodeProperties | undefined,
    parentId: string | null | undefined
  ): Node | null {
    if (userProperties?.detached || parentId === null) return null;
    if (parentId) return this.getNode(parentId) ?? null;

    return this.getSelectedNode();
  }

  /**
   * Adds multiple nodes at once and saves one snapshot to history. A node
   * with an empty parent becomes a root, whatever node is selected.
   * @param {ExportNodeProperties[]} nodes
   * @param {boolean} updateHistory
   */
  public addNodes = (nodes: ExportNodeProperties[], updateHistory = true) => {
    nodes.forEach(node => {
      if (!this.existNode(node.id)) {
        this.addNode(node, false, false, node.parent || null, node.id);
      }
    });

    if (updateHistory) {
      this.map.history.save();
    }
  };

  /**
   * Select a node or return the current selected node.
   * @param {string} id
   * @returns {ExportNodeProperties}
   */
  public selectNode = (id?: string): ExportNodeProperties => {
    if (id !== undefined) {
      if (typeof id !== 'string') {
        Log.error('The node id must be a string', 'type');
      }

      if (!this.nodeSelectionTo(id)) {
        const node = this.nodes.get(id);
        if (node) {
          const background = node.getBackgroundDOM();

          const color = d3.color(background.style.fill)?.darker(0.5);

          if (color && background.style.stroke !== color.toString()) {
            if (this.selectedNode) {
              this.selectedNode.getBackgroundDOM().style.stroke = '';
            }

            background.style.stroke = color.toString();

            // Don't blur the node that's currently being edited (#1249): on
            // mobile, d3-drag's `started` callback fires on the second tap
            // that enters edit mode and calls selectNode for the same node,
            // which used to steal focus from the just-focused contenteditable
            // and stop the soft keyboard from opening.
            const prevName = this.selectedNode.getNameDOM();
            const wouldBlurActiveEdit =
              this.selectedNode === node && document.activeElement === prevName;
            if (!wouldBlurActiveEdit) {
              Utils.removeAllRanges();
              prevName.blur();
            }

            this.map.events.call(
              Event.nodeDeselect,
              this.selectedNode.dom,
              this.getNodeProperties(this.selectedNode)
            );

            this.selectedNode = node;
            this.map.events.call(
              Event.nodeSelect,
              node.dom,
              this.getNodeProperties(node)
            );
          }
        } else {
          Log.error('The node id or the direction is not correct');
        }
      }
    }

    return this.getNodeProperties(this.selectedNode);
  };

  /**
   * Highlighs node with a border
   * @param {string} id
   * @param {string} color
   * @returns {void}
   */
  public highlightNodeWithColor = (
    id: string,
    color: string,
    notifyWithEvent = true
  ): void => {
    if (id !== undefined) {
      if (typeof id !== 'string') {
        Log.error('The node id must be a string', 'type');
      }

      const node = this.nodes.get(id);
      if (node) {
        const background = node.getBackgroundDOM();

        if (background.style.stroke !== color) {
          background.style.stroke = DOMPurify.sanitize(color);

          if (notifyWithEvent)
            this.map.events.call(
              Event.nodeUpdate,
              node.dom,
              this.getNodeProperties(node)
            );
        }
      } else {
        Log.error('The node id is not correct');
      }
    }
  };

  /**
   * Check if a node exist
   * @param {string} id
   * @returns {boolean}
   */
  public existNode = (id?: string): boolean => {
    if (id !== undefined) {
      if (typeof id !== 'string') {
        Log.error('The node id must be a string', 'type');
        return false;
      }

      return this.nodes.has(id);
    }
    return false;
  };

  /**
   * Enable the node name editing of the selected node.
   */
  public editNode = () => {
    if (this.selectedNode) {
      this.map.draw.enableNodeNameEditing(this.selectedNode);
    }
  };

  /**
   * Toggle (hide/show) all child nodes of selected node
   */
  public toggleBranchVisibility = () => {
    if (!this.selectedNode) return;

    const children = this.getChildren(this.selectedNode);

    // One hidden child shows the whole branch, and children that all show hide
    // it. Deciding once for the branch repairs children that disagree, which
    // happens after somebody else adds a node to a branch hidden here.
    this.selectedNode.hasHiddenChildNodes =
      children.length > 0 && !children.some(x => x.hidden);

    this.applyHiddenStateToDescendants(this.selectedNode);

    this.map.draw.update();
    this.map.history.save();
  };

  /**
   * Set the hidden flag of every descendant from its parent, so a descendant
   * hides whenever its parent hides its children. A branch this person hid
   * further down stays hidden, because getDescendants returns each parent
   * before its own children.
   * @param {Node} node
   */
  private applyHiddenStateToDescendants = (node: Node) => {
    this.getDescendants(node).forEach(descendant => {
      const parent = descendant.parent;
      const hidden = parent ? this.hidesChildNodes(parent) : false;
      this.updateNode('hidden', hidden, false, false, descendant.id);
    });
  };

  /**
   * Tell whether the children of a node are hidden, which happens when the
   * node itself is hidden or when this person hid its branch.
   * @param {Node} node
   * @returns {boolean}
   */
  private hidesChildNodes = (node: Node): boolean =>
    node.hidden || node.hasHiddenChildNodes;

  /**
   * Deselect the current selected node.
   */
  public deselectNode = () => {
    if (this.selectedNode?.id === this.getRoot().id) return;

    const oldNodeProps: ExportNodeProperties = this.getNodeProperties(
      this.selectedNode
    );
    const oldDom: SVGGElement = this.selectedNode.dom;

    if (this.selectedNode) {
      this.selectedNode.getBackgroundDOM().style.stroke = '';
      Utils.removeAllRanges();
    }

    this.selectRootNode();

    this.map.events.call(Event.nodeDeselect, oldDom, oldNodeProps);
  };

  /**
   * Update the properties of the selected node.
   */
  public updateNode = (
    property: NodeProperty | string,
    value: NodePropertyValue | unknown,
    notifyWithEvent = true,
    updateHistory = true,
    id?: string
  ) => {
    if (id && typeof id !== 'string') {
      Log.error('The node id must be a string', 'type');
    }

    const node: Node | undefined = id ? this.getNode(id) : this.selectedNode;

    if (node === undefined) {
      Log.error('There are no nodes with id "' + id + '"');
      return;
    }

    if (typeof property !== 'string') {
      Log.error('The property must be a string', 'type');
    }

    let updated: boolean | void = false;
    const propertyPath =
      PropertyMapping[property as keyof typeof PropertyMapping];
    const previousValue: unknown = propertyPath
      ? Utils.get(node, propertyPath)
      : undefined;

    switch (property) {
      case 'name':
        updated = this.updateNodeName(node, value as string);
        break;
      case 'locked':
        updated = this.updateNodeLockedStatus(node, value as boolean);
        break;
      case 'coordinates':
        updated = this.updateNodeCoordinatesWithoutDescendants(
          node,
          value as MapNodeCoordinates
        );
        break;
      case 'imageSrc':
        updated = this.updateNodeImageSrc(node, value as string);
        break;
      case 'imageSize':
        updated = this.updateNodeImageSize(node, value as number);
        break;
      case 'linkHref':
        updated = this.updateNodeLinkHref(node, value as string);
        break;
      case 'backgroundColor':
        updated = this.updateNodeBackgroundColor(node, value as string);
        break;
      case 'branchColor':
        updated = this.updateNodeBranchColor(node, value as string);
        break;
      case 'fontWeight':
        updated = this.updateNodeFontWeight(node, value as string);
        break;
      case 'fontStyle':
        updated = this.updateNodeFontStyle(node, value as string);
        break;
      case 'fontSize':
        updated = this.updateNodeFontSize(node, value as number);
        break;
      case 'nameColor':
        updated = this.updateNodeNameColor(node, value as string);
        break;
      case 'hidden':
        updated = this.updateNodeHidden(node, value as boolean);
        break;
      default:
        Log.error('The property does not exist');
    }
    if (updated !== false && updateHistory) {
      this.map.history.save();
    }

    if (updated !== false && notifyWithEvent) {
      this.map.events.call(Event.nodeUpdate, node.dom, {
        nodeProperties: this.getNodeProperties(node),
        changedProperty: property,
        previousValue,
      });
    }
  };

  /**
   * Remove the selected node.
   * @param {string} id
   */
  public removeNode = (id?: string, notifyWithEvent = true) => {
    if (id && typeof id !== 'string') {
      Log.error('The node id must be a string', 'type');
    }

    const node: Node | undefined = id ? this.getNode(id) : this.selectedNode;

    if (node === undefined) {
      Log.error('There are no nodes with id "' + id + '"');
      return;
    }

    if (!node.isRoot) {
      this.nodes.delete(node.id);

      this.getDescendants(node).forEach((node: Node) => {
        this.nodes.delete(node.id);
      });

      this.map.draw.clear();
      this.map.draw.update();

      this.map.history.save();

      if (notifyWithEvent)
        this.map.events.call(
          Event.nodeRemove,
          undefined,
          this.getNodeProperties(node)
        );

      this.deselectNode();
    } else {
      Log.error('The root node can not be deleted');
    }
  };

  /**
   * Return the children of the node.
   * @param {string} id
   * @returns {ExportNodeProperties[]}
   */
  public nodeChildren = (id?: string): ExportNodeProperties[] => {
    if (id && typeof id !== 'string') {
      Log.error('The node id must be a string', 'type');
    }

    const node = id ? this.getNode(id) : this.selectedNode;

    if (node === undefined) {
      Log.error('There are no nodes with id "' + id + '"');
    }

    return Array.from(this.nodes.values())
      .filter((n: Node) => {
        return n.parent && n.parent.id === node.id;
      })
      .map((n: Node) => {
        return this.getNodeProperties(n);
      });
  };

  /**
   * Return the export properties of the node.
   * @param {Node} node
   * @param {boolean} fixedCoordinates
   * @returns {ExportNodeProperties} properties
   */
  public getNodeProperties(
    node: Node,
    fixedCoordinates = false
  ): ExportNodeProperties {
    return {
      id: node.id,
      parent: node.parent ? node.parent.id : '',
      name: node.name,
      coordinates: fixedCoordinates
        ? this.fixCoordinates(node.coordinates, true)
        : (Utils.cloneObject(node.coordinates) as MapNodeCoordinates),
      image: Utils.cloneObject(node.image) as MapNodeImage,
      colors: Utils.cloneObject(node.colors) as MapNodeColors,
      font: Utils.cloneObject(node.font) as MapNodeFont,
      link: Utils.cloneObject(node.link) as MapNodeLink,
      locked: node.locked,
      isRoot: node.isRoot,
      detached: node.detached,
      hidden: node.hidden,
      hasHiddenChildNodes: node.hasHiddenChildNodes,
      k: node.k,
    };
  }

  /**
   * Convert external coordinates to internal or otherwise.
   * @param {MapNodeCoordinates} coordinates
   * @param {boolean} reverse
   * @returns {MapNodeCoordinates}
   */
  public fixCoordinates(
    coordinates: MapNodeCoordinates,
    reverse = false
  ): MapNodeCoordinates {
    const svgEl = this.map.dom.svg.node();
    const zoomCoordinates = svgEl
      ? d3.zoomTransform(svgEl)
      : { x: 0, y: 0, k: 1 };
    const fixedCoordinates: MapNodeCoordinates = {} as MapNodeCoordinates;

    if (coordinates.x) {
      if (reverse === false) {
        fixedCoordinates.x =
          (coordinates.x - zoomCoordinates.x) / zoomCoordinates.k;
      } else {
        fixedCoordinates.x =
          coordinates.x * zoomCoordinates.k + zoomCoordinates.x;
      }
    }

    if (coordinates.y) {
      if (reverse === false) {
        fixedCoordinates.y =
          (coordinates.y - zoomCoordinates.y) / zoomCoordinates.k;
      } else {
        fixedCoordinates.y =
          coordinates.y * zoomCoordinates.k + zoomCoordinates.y;
      }
    }

    return coordinates;
  }

  /**
   * Move the node selection in the direction passed as parameter.
   * @param {string} direction
   * @returns {boolean}
   */
  private nodeSelectionTo(direction: string): boolean {
    switch (direction) {
      case 'up':
        this.moveSelectionOnLevel(true);
        return true;
      case 'down':
        this.moveSelectionOnLevel(false);
        return true;
      case 'left':
        this.moveSelectionOnBranch(true);
        return true;
      case 'right':
        this.moveSelectionOnBranch(false);
        return true;
      default:
        return false;
    }
  }

  /**
   * Return the children of a node.
   * @param {Node} node
   * @returns {Node[]}
   */
  public getChildren(node: Node): Node[] {
    return Array.from(this.nodes.values()).filter((n: Node) => {
      return n.parent && n.parent.id === node.id;
    });
  }

  /**
   * Return whether a node is left of the root of its own tree (true if left).
   * A root has no side and returns undefined.
   * @return {boolean}
   */
  public getOrientation(node: Node): boolean | undefined {
    if (!node.parent) {
      return;
    }

    const root = this.getTreeRoot(node);

    return (node.coordinates?.x ?? 0) < (root.coordinates?.x ?? 0);
  }

  /**
   * Return the root of the tree a node belongs to: the ancestor with no
   * parent. A cycle of ancestors stops at the node that closes it.
   * @returns {Node} root
   */
  public getTreeRoot(node: Node): Node {
    const visited = new Set<Node>([node]);
    let current = node;

    while (current.parent && !visited.has(current.parent)) {
      current = current.parent;
      visited.add(current);
    }

    return current;
  }

  /**
   * Returns the coordinates for the root of a new tree: its centre twice
   * NODE_HORIZONTAL_SPACING right of the bounding box of every node this
   * client holds, level with the main root. `pickColumn` puts a root's first
   * child one spacing to its left, so the second spacing keeps that column
   * clear of the other trees. The client writes these coordinates with the
   * root, so the root keeps them from then on.
   * @returns {MapNodeCoordinates} coordinates
   */
  public newTreeCoordinates = (): MapNodeCoordinates => {
    const rightEdge = this.getNodes().reduce(
      (edge, node) =>
        Math.max(edge, node.coordinates.x + node.dimensions.width / 2),
      -Infinity
    );

    return {
      x: rightEdge + 2 * NODE_HORIZONTAL_SPACING,
      y: this.getRoot().coordinates.y,
    };
  };

  /**
   * Return all descendants of a node.
   * @returns {Node[]} nodes
   */
  public getDescendants(node: Node): Node[] {
    let nodes: Node[] = [];
    this.getChildren(node).forEach((node: Node) => {
      nodes.push(node);
      nodes = nodes.concat(this.getDescendants(node));
    });
    return nodes;
  }

  /**
   * Return an array of all nodes.
   */
  public getNodes(): Node[] {
    return Array.from(this.nodes.values());
  }

  /**
   * Return the root parameters
   */
  public exportRootProperties = (): ExportNodeProperties => {
    return this.getNodeProperties(this.getRoot());
  };

  /**
   * Set a node as a id-value copy.
   */
  public setNode(key: string, node: Node) {
    this.nodes.set(key, node);
  }

  /**
   * Return the current selected node.
   * @returns {Node}
   */
  public getSelectedNode = (): Node => {
    return this.selectedNode;
  };

  /**
   * Set the root node as selected node.
   */
  public selectRootNode() {
    this.selectedNode = this.getRoot();
  }

  /**
   * Delete all nodes.
   */
  public clear() {
    this.nodes.clear();
  }

  /**
   * Return the root node.
   * @returns {Node} rootNode
   */
  public getRoot = (): Node => {
    const root = this.nodes.get(this.map.rootId);

    if (root === undefined) {
      Log.error('The map has no root node');
    }

    return root;
  };

  /**
   * Return the node with the id equal to id passed as parameter.
   * @param {string} id
   * @returns {Node | undefined}
   */
  public getNode = (id: string): Node | undefined => {
    if (id !== undefined) {
      if (typeof id !== 'string') {
        Log.error('The node id must be a string', 'type');
        return undefined;
      }
      return this.nodes.get(id);
    }
    return undefined;
  };

  /**
   * Return the siblings of a node.
   * @param {Node} node
   * @returns {Array<Node>} siblings
   */
  private getSiblings(node: Node): Node[] {
    if (node.isRoot || node.detached || !node.parent) {
      return [];
    }

    const parentChildren: Node[] = this.getChildren(node.parent);

    if (parentChildren.length > 1) {
      parentChildren.splice(parentChildren.indexOf(node), 1);
      return parentChildren;
    }

    return [];
  }

  /**
   * Where a node added interactively goes: one column out from its parent and
   * below its lowest sibling.
   */
  private calculateCoordinates(node: Node): MapNodeCoordinates {
    const parent = node.parent;
    const anchorX = parent?.coordinates?.x ?? node.coordinates?.x ?? 0;
    const anchorY = parent?.coordinates?.y ?? node.coordinates?.y ?? 0;
    const { column, siblings } = this.pickColumn(node);

    return { x: anchorX + column, y: this.stackBelow(node, anchorY, siblings) };
  }

  /**
   * The column a new node lands in, as an offset from its parent, plus the
   * siblings sharing that column. A child of a root takes the side of its
   * tree that currently holds fewer siblings.
   */
  private pickColumn(node: Node): { column: number; siblings: Node[] } {
    const siblings = this.getSiblings(node);
    const parent = node.parent;

    if (parent && !parent.parent) {
      const [left, right] = this.splitByOrientation(siblings);
      return left.length <= right.length
        ? { column: -NODE_HORIZONTAL_SPACING, siblings: left }
        : { column: NODE_HORIZONTAL_SPACING, siblings: right };
    }
    if (node.detached) return { column: 0, siblings };

    const goesLeft = !!parent && this.getOrientation(parent);
    const column = goesLeft
      ? -NODE_HORIZONTAL_SPACING
      : NODE_HORIZONTAL_SPACING;

    return { column, siblings };
  }

  private splitByOrientation(siblings: Node[]): [Node[], Node[]] {
    const left: Node[] = [];
    const right: Node[] = [];

    for (const sibling of siblings) {
      (this.getOrientation(sibling) ? left : right).push(sibling);
    }

    return [left, right];
  }

  /** Below the lowest sibling, or just above the parent when there is none. */
  private stackBelow(node: Node, anchorY: number, siblings: Node[]): number {
    if (siblings.length > 0) {
      const lowerNode = this.getLowerNode(siblings);
      return (lowerNode?.coordinates?.y ?? 0) + NODE_VERTICAL_SIBLING_OFFSET;
    }

    return node.detached ? anchorY : anchorY - NODE_VERTICAL_SPACING;
  }

  /**
   * Position the snapshot nodes that arrive without coordinates - every node of
   * an AI or mermaid import, which carry structure only. A node that already
   * has coordinates keeps them, so re-importing an exported map moves nothing.
   *
   * `calculateCoordinates` cannot do this job: it reads siblings that have not
   * been positioned yet, so it superimposes whole branches on a bulk import.
   */
  public applyCoordinatesToMapSnapshot = (
    mapSnapshot: MapSnapshot
  ): MapSnapshot => {
    if (mapSnapshot.every(node => !!node.coordinates)) return mapSnapshot;

    const layout = computeMapLayout(mapSnapshot);

    return mapSnapshot.map(node => {
      const position = layout.get(node.id);
      if (!node.coordinates && position) {
        node.coordinates = { x: position.x, y: position.y };
      }

      return node;
    });
  };

  /**
   * Recompute every node's coordinates from the tree structure and the node
   * sizes, discarding manual positioning. One mmp history entry covers the
   * whole rewrite; the undo the user actually sees comes from the Y.Doc
   * transaction that the distribute event triggers.
   */
  public distributeNodes = (notifyWithEvent = true) => {
    const layout = computeMapLayout(this.toLayoutInput());
    if (layout.size === 0) return;

    for (const [id, coordinates] of layout) {
      this.moveNodeTo(id, coordinates);
    }

    // Redrawing the branches costs a full selection pass, so it happens once
    // here rather than once per node as the single-node move path does.
    this.redrawBranches();
    this.map.draw.update();
    this.map.history.save();

    if (notifyWithEvent) {
      this.map.events.call(Event.distribute);
    }
  };

  /** Move one node, leaving the branch redraw to the caller. */
  private moveNodeTo(id: string, coordinates: MapNodeCoordinates): void {
    const node = this.nodes.get(id);
    if (!node) return;

    node.coordinates = { x: coordinates.x, y: coordinates.y };
    node.dom?.setAttribute(
      'transform',
      'translate(' + [coordinates.x, coordinates.y] + ')'
    );
  }

  private redrawBranches(): void {
    d3.selectAll<SVGPathElement, Node>('.' + this.map.id + '_branch').attr(
      'd',
      (node: Node) => {
        // A detached node has no parent and so no branch to draw. Returning
        // null makes d3 drop the attribute, as the other redraw paths do.
        const branch = this.map.draw.drawBranch(node);

        return branch ? branch.toString() : null;
      }
    );
  }

  private toLayoutInput(): LayoutInputNode[] {
    return Array.from(this.nodes.values()).map(node => ({
      id: node.id,
      parent: node.parent ? node.parent.id : '',
      isRoot: node.isRoot,
      detached: node.detached,
      name: node.name,
      font: node.font,
      coordinates: node.coordinates,
      dimensions: node.dimensions,
    }));
  }

  /**
   * Return the lower node of a list of nodes.
   * @param {Node[]} nodes
   * @returns {Node} lowerNode
   */
  private getLowerNode(nodes: Node[]): Node | undefined {
    if (nodes.length === 0) {
      return;
    }

    return nodes.reduce((lowest, current) => {
      const lowestY = lowest.coordinates?.y ?? 0;
      const currentY = current.coordinates?.y ?? 0;

      return currentY > lowestY ? current : lowest;
    }, nodes[0]);
  }

  /**
   * Update the node name with a new value.
   * @param {Node} node
   * @param {string} name
   * @returns {boolean}
   */
  private updateNodeName = (node: Node, name: string): boolean => {
    if (name && typeof name !== 'string') {
      Log.error('The name must be a string', 'type');
    }

    if (node.name != name) {
      node.getNameDOM().innerHTML = DOMPurify.sanitize(name);

      this.map.draw.updateNodeShapes(node);

      node.name = name;
      return true;
    } else {
      return false;
    }
  };

  /**
   * Update the node coordinates with a new value.
   * The main method for moving nodes is located inside the drag module.
   * This method acts as a more simpler way of just moving one node.
   * @param {Node} node
   * @param {MapNodeCoordinates} coordinates
   * @returns {boolean}
   */
  private updateNodeCoordinatesWithoutDescendants = (
    initialNode: Node,
    coordinates: MapNodeCoordinates
  ): boolean => {
    // no moving of descendants here
    const fixedCoordinates = coordinates;

    coordinates = Utils.mergeObjects(
      initialNode.coordinates,
      fixedCoordinates,
      true
    ) as MapNodeCoordinates;

    if (
      !(
        coordinates.x === initialNode.coordinates.x &&
        coordinates.y === initialNode.coordinates.y
      )
    ) {
      initialNode.coordinates = Utils.cloneObject(
        coordinates
      ) as MapNodeCoordinates;
      initialNode.dom.setAttribute(
        'transform',
        'translate(' + [coordinates.x, coordinates.y] + ')'
      );

      d3.selectAll<SVGPathElement, Node>('.' + this.map.id + '_branch').attr(
        'd',
        (node: Node) => {
          const branch = this.map.draw.drawBranch(node);
          return branch ? branch.toString() : null;
        }
      );

      return true;
    } else {
      return false;
    }
  };

  /**
   * Update the node background color with a new value.
   * @param {Node} node
   * @param {string} color
   * @returns {boolean}
   */
  private updateNodeBackgroundColor = (node: Node, color: string): boolean => {
    if (color && typeof color !== 'string') {
      Log.error('The background color must be a string', 'type');
    }

    const sanitizedColor = DOMPurify.sanitize(color);

    if (node.colors.background !== color) {
      const background = node.getBackgroundDOM();

      background.style.fill = sanitizedColor;

      if (background.style.stroke !== '') {
        const darker = d3.color(sanitizedColor)?.darker(0.5);
        if (darker) {
          background.style.stroke = darker.toString();
        }
      }

      node.colors.background = sanitizedColor;
      return true;
    } else {
      return false;
    }
  };

  /**
   * Update the node text color with a new value.
   * @param {Node} node
   * @param {string} color
   * @returns {boolean}
   */
  private updateNodeNameColor = (node: Node, color: string): boolean => {
    if (color && typeof color !== 'string') {
      Log.error('The text color must be a string', 'type');
    }

    const sanitizedColor = DOMPurify.sanitize(color);

    if (node.colors.name !== color) {
      node.getNameDOM().style.color = sanitizedColor;

      node.colors.name = sanitizedColor;
      return true;
    } else {
      return false;
    }
  };

  /**
   * Update the node branch color with a new value.
   * @param {Node} node
   * @param {string} color
   * @returns {boolean}
   */
  private updateNodeBranchColor = (node: Node, color: string): boolean => {
    if (color && typeof color !== 'string') {
      Log.error('The branch color must be a string', 'type');
    }

    const sanitizedColor = DOMPurify.sanitize(color);

    if (node.parent) {
      if (node.colors.name !== color) {
        const branch = document.getElementById(node.id + '_branch');

        if (branch) {
          branch.style.fill = branch.style.stroke = sanitizedColor;
        }

        node.colors.branch = sanitizedColor;
        return true;
      } else {
        return false;
      }
    } else if (node.colors.branch === sanitizedColor) {
      // A remote colors sync sends the branch color with the other colors,
      // unchanged, so a root accepts its own value without an error.
      return false;
    } else {
      Log.error('A root node has no branches');
    }
  };

  /**
   * Update the node font size with a new value.
   * @param {Node} node
   * @param {number} size
   * @returns {boolean}
   */
  private updateNodeFontSize = (node: Node, size: number): boolean => {
    if (size && typeof size !== 'number') {
      Log.error('The font size must be a number', 'type');
    }

    if (node.font.size != size) {
      node.getNameDOM().style.fontSize = size + 'px';

      this.map.draw.updateNodeShapes(node);

      node.font.size = size;
      return true;
    } else {
      return false;
    }
  };

  /**
   * Update the node image size with a new value.
   * @param {Node} node
   * @param {number} size
   * @returns {boolean}
   */
  private updateNodeImageSize = (node: Node, size: number): boolean => {
    if (size && typeof size !== 'number') {
      Log.error('The image size must be a number', 'type');
    }

    if (node.image.src !== '') {
      if (node.image.size !== size) {
        const image = node.getImageDOM(),
          box = image.getBBox(),
          height = size,
          width = (box.width * height) / box.height,
          y = -(height + node.dimensions.height / 2 + 5),
          x = -width / 2;

        image.setAttribute('height', height.toString());
        image.setAttribute('width', width.toString());
        image.setAttribute('y', y.toString());
        image.setAttribute('x', x.toString());

        node.image.size = height;
        return true;
      } else {
        return false;
      }
    } else {
      Log.error('The node does not have an image');
      return false;
    }
  };

  /**
   * Update the node image src with a new value.
   * @param {Node} node
   * @param {string} src
   * @returns {boolean}
   */
  private updateNodeImageSrc = (node: Node, src: string): boolean => {
    if (src && typeof src !== 'string') {
      Log.error('The image path must be a string', 'type');
    }

    if (node.image.src !== src) {
      node.image.src = src;

      this.map.draw.setImage(node);
      return true;
    } else {
      return false;
    }
  };

  /**
   * Update the node link href with a new value.
   * @param {Node} node
   * @param {string} href
   * @returns {boolean}
   */
  private updateNodeLinkHref = (node: Node, href: string): boolean => {
    if (href && typeof href !== 'string') {
      Log.error('The link href must be a string', 'type');
    }

    if (node.link.href !== href) {
      node.link.href = href;

      this.map.draw.setLink(node);
      return true;
    } else {
      return false;
    }
  };

  /**
   * Update the node hidden value
   * @param {Node} node
   * @param {boolean} hidden
   * @returns {boolean}
   */
  private updateNodeHidden = (node: Node, hidden: boolean): boolean => {
    if (hidden && typeof hidden !== 'boolean') {
      Log.error('The hidden value must be boolean', 'type');
    }

    if (node.hidden !== hidden) {
      node.hidden = hidden;
      return true;
    } else {
      return false;
    }
  };

  /**
   * Update the node font style.
   * @param {Node} node
   * @param {string} style
   * @returns {boolean}
   */
  private updateNodeFontStyle = (node: Node, style: string): boolean => {
    if (style && typeof style !== 'string') {
      Log.error('The font style must be a string', 'type');
    }

    if (node.font.style !== style) {
      node.getNameDOM().style.fontStyle = DOMPurify.sanitize(style);

      node.font.style = style;
      return true;
    } else {
      return false;
    }
  };

  /**
   * Update the node font weight.
   * @param {Node} node
   * @param {string} weight
   * @returns {boolean}
   */
  private updateNodeFontWeight = (node: Node, weight: string): boolean => {
    if (weight && typeof weight !== 'string') {
      Log.error('The font weight must be a string', 'type');
    }

    if (node.font.weight !== weight) {
      node.getNameDOM().style.fontWeight = DOMPurify.sanitize(weight);

      this.map.draw.updateNodeShapes(node);

      node.font.weight = weight;
      return true;
    } else {
      return false;
    }
  };

  /**
   * Update the node locked status.
   * @param {Node} node
   * @param {boolean} flag
   * @returns {boolean}
   */
  private updateNodeLockedStatus = (node: Node, flag: boolean): boolean => {
    if (flag && typeof flag !== 'boolean') {
      Log.error('The node locked status must be a boolean', 'type');
    }

    if (!node.isRoot) {
      node.locked = flag || !node.locked;
      return true;
    } else {
      Log.error('The root node can not be locked');
      return false;
    }
  };

  /**
   * Move the node selection on the level of the current node (true: up).
   * @param {boolean} direction
   */
  private moveSelectionOnLevel(direction: boolean) {
    const parent = this.selectedNode.parent;

    if (parent) {
      let siblings = this.getSiblings(this.selectedNode).filter(
        (node: Node) => {
          return (
            direction === node.coordinates.y < this.selectedNode.coordinates.y
          );
        }
      );

      if (!parent.parent) {
        siblings = siblings.filter((node: Node) => {
          return (
            this.getOrientation(node) === this.getOrientation(this.selectedNode)
          );
        });
      }

      if (siblings.length > 0) {
        let closerNode: Node = siblings[0],
          tmp = Math.abs(
            siblings[0].coordinates.y - this.selectedNode.coordinates.y
          );

        for (const node of siblings) {
          const distance = Math.abs(
            node.coordinates.y - this.selectedNode.coordinates.y
          );

          if (distance < tmp) {
            tmp = distance;
            closerNode = node;
          }
        }

        this.selectNode(closerNode.id);
      }
    }
  }

  /**
   * Move the node selection in a child node or in the parent node (true: left)
   * @param {boolean} direction
   */
  private moveSelectionOnBranch(direction: boolean) {
    const orientation = this.getOrientation(this.selectedNode);
    const parent = this.selectedNode.parent;
    const movesToParent =
      (!orientation && direction) || (orientation && !direction);

    // A root has no parent and no orientation, so it always moves to a child
    // on the requested side.
    if (movesToParent && parent) {
      this.selectNode(parent.id);
      return;
    }

    let children = this.getChildren(this.selectedNode);

    if (orientation === undefined) {
      // The selected node is a root
      children = children.filter((node: Node) => {
        return this.getOrientation(node) === direction;
      });
    }

    const lowerNode = this.getLowerNode(children);

    if (children.length > 0 && lowerNode) {
      this.selectNode(lowerNode.id);
    }
  }
}
