import Node, { NodeProperties } from '../models/node.js';
import NodeStore from '../models/node-store.js';
import type { NodeView } from './node-view.js';
import MmpMap from '../map.js';
import * as d3 from 'd3';
import * as v from 'valibot';
import { v4 as uuidv4 } from 'uuid';
import { CssColorSchema, NodePropertySchemas } from '@teammapper/shared';
import Log from '../../utils/log.js';
import Utils from '../../utils/utils.js';
import { computeMapLayout, LayoutInputNode } from './layout.js';
import {
  NODE_HORIZONTAL_SPACING,
  NODE_VERTICAL_SPACING,
  type Bounds,
} from './node-geometry.js';
import {
  findClearSpot,
  NEW_TREE_FOOTPRINT,
  NEW_TREE_GAP,
  nodeBounds,
  treeBounds,
} from './tree-placement.js';
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
export const PropertyMapping = {
  name: ['name'],
  protected: ['protected'],
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
} as const satisfies Record<NodeProperty, readonly string[]>;

const isNodeProperty = (property: string): property is NodeProperty =>
  Object.keys(PropertyMapping).includes(property);

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
  }
  static NodePropertyMapping: typeof PropertyMapping = PropertyMapping;

  private map: MmpMap;

  public readonly store = new NodeStore();

  /** The view every node change reports to. */
  private get view(): NodeView {
    return this.map.draw;
  }
  // deselectNode sets this to null. A map load selects the main root.
  private selectedNode: Node | null = null;

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
      id: rootId,
      parent: null,
      hidden: false,
      isRoot: true,
    }) as unknown as NodeProperties;

    this.map.rootId = rootId;

    const node: Node = new Node(properties);

    if (coordinates) {
      node.coordinates.x = coordinates.x || node.coordinates.x;
      node.coordinates.y = coordinates.y || node.coordinates.y;
    }

    this.store.set(node);

    this.map.draw.update();

    this.selectRootNode();
  }

  /**
   * Add a node like addNode. A local add under a protected parent adds
   * nothing, announces the refusal and returns null. addNode itself stays
   * unguarded because remote writes, paste and new trees call it.
   */
  public addNodeUnlessProtected = (
    ...args: Parameters<Nodes['addNode']>
  ): Node | null => {
    const [, notifyWithEvent = true, , parentId] = args;
    const parentNode = this.resolveParent(parentId);
    if (parentNode && this.refusesLocalChange(parentNode, notifyWithEvent)) {
      return null;
    }

    return this.addNode(...args);
  };

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
    const parentNode = this.resolveParent(parentId);
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

    this.store.set(node);

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

    if (notifyWithEvent) {
      this.map.events.emit('nodeCreate', this.getNodeProperties(node));
    }
    return node;
  };

  /**
   * The parent a node added through addNode gets: none for an explicit null,
   * the named node for an id, the selected node otherwise. Throws when the
   * caller names no parent and nothing is selected, because a new root node
   * would hide the caller's mistake.
   */
  private resolveParent(parentId: string | null | undefined): Node | null {
    if (parentId === null) return null;
    if (parentId) return this.getNode(parentId) ?? null;
    if (!this.selectedNode) Log.error('There is no selected node');

    return this.selectedNode;
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
   * Select a node or return the current selected node, null when nothing is
   * selected.
   * @param {string} id
   * @returns {ExportNodeProperties | null}
   */
  public selectNode = (id?: string): ExportNodeProperties | null => {
    if (id !== undefined) {
      if (typeof id !== 'string') {
        Log.error('The node id must be a string', 'type');
      }

      if (!this.nodeSelectionTo(id)) {
        const node = this.store.get(id);
        if (node) {
          const background = node.getBackgroundDOM();

          const color = this.ringColor(node);

          if (color && background.style.stroke !== color) {
            this.releaseSelection(node);

            background.style.stroke = color;

            this.announceSelection(node);
          }
        } else {
          Log.error('The node id or the direction is not correct');
        }
      }
    }

    return this.selectedNode ? this.getNodeProperties(this.selectedNode) : null;
  };

  /**
   * Draw the ring on the selected node again. A full draw of the map gives
   * every node a new DOM without the ring.
   */
  public redrawSelectionRing() {
    if (!this.selectedNode) return;

    const color = this.ringColor(this.selectedNode);
    if (color) this.selectedNode.getBackgroundDOM().style.stroke = color;
  }

  /**
   * The ring colour of a node: its background fill, darkened. Null when the
   * fill holds no colour.
   * @param {Node} node
   * @returns {string | null}
   */
  private ringColor(node: Node): string | null {
    const fill = node.getBackgroundDOM().style.fill;
    return d3.color(fill)?.darker(0.5).toString() ?? null;
  }

  /**
   * Make the node the selected node and tell listeners it took the selection.
   * @param {Node} node
   */
  private announceSelection(node: Node) {
    this.selectedNode = node;
    this.map.events.emit('nodeSelect', this.getNodeProperties(node));
  }

  /**
   * Clear the ring and the focus of the selected node, leave nothing
   * selected, and tell listeners the node lost the selection. `next` names
   * the node about to take the selection, or null for a deselect.
   * @param {Node | null} next
   */
  private releaseSelection(next: Node | null) {
    const previous = this.selectedNode;
    if (!previous) return;

    previous.getBackgroundDOM().style.stroke = '';

    // Keep focus on the node the user is editing (#1249): on mobile,
    // d3-drag's `started` callback fires on the second tap that enters edit
    // mode and calls selectNode for the same node, which used to steal focus
    // from the just-focused contenteditable and stop the soft keyboard from
    // opening.
    const prevName = previous.getNameDOM();
    const editingSameNode =
      previous === next && document.activeElement === prevName;
    if (!editingSameNode) {
      Utils.removeAllRanges();
      prevName.blur();
    }

    // The blur runs first: the name editor's onblur commits the name through
    // updateNode without an id, which targets the selected node.
    this.selectedNode = null;
    this.map.events.emit('nodeDeselect', this.getNodeProperties(previous));
  }

  /**
   * Draw a ring in `color` around the node, as a peer's selection does. A
   * peer picks its own color, so an invalid one draws nothing.
   * @param {string} id
   * @param {string} color
   */
  public highlightNodeWithColor = (id: string, color: string): void => {
    const node = this.store.get(id);
    if (!node) Log.error('The node id is not correct');
    if (!v.is(CssColorSchema, color)) return;

    node.getBackgroundDOM().style.stroke = color;
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

      return this.store.has(id);
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
   * Deselect the current selected node, the main root included, and leave
   * nothing selected.
   */
  public deselectNode = () => {
    this.releaseSelection(null);
  };

  /**
   * Return the node with `id`, or the selected node when the caller passes no
   * id. Return null when the caller passes no id and nothing is selected.
   * Throw when `id` names no node.
   * @param {string} id
   * @returns {Node | null}
   */
  public getTargetNode = (id?: string): Node | null => {
    if (id && typeof id !== 'string') {
      Log.error('The node id must be a string', 'type');
    }
    if (!id) return this.selectedNode;

    const node = this.getNode(id);
    if (node === undefined) {
      Log.error('There are no nodes with id "' + id + '"');
    }

    return node;
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
    const node = this.getTargetNode(id);
    if (!node) return;

    if (typeof property !== 'string' || !isNodeProperty(property)) {
      Log.error('The property does not exist');
    }

    // Hiding and changing the protection itself stay allowed.
    const guarded = property !== 'protected' && property !== 'hidden';
    if (guarded && this.refusesLocalChange(node, notifyWithEvent)) return;

    const previousValue = Utils.get(node, PropertyMapping[property]);
    const nextValue = this.validatedValue(node, property, value);
    if (Nodes.sameValue(previousValue, nextValue)) return;

    this.writeProperty(node, property, nextValue);
    this.view.renderNodeProperty(node, property);

    if (updateHistory) {
      this.map.history.save();
    }

    if (notifyWithEvent) {
      this.map.events.emit('nodeUpdate', {
        nodeProperties: this.getNodeProperties(node),
        changedProperty: property,
        previousValue,
      });
    }
  };

  /**
   * Check a new value of the property against the shared schema and the
   * node, and return the value the model takes. An empty value clears a
   * text property and leaves a number as it is.
   */
  private validatedValue(
    node: Node,
    property: NodeProperty,
    value: unknown
  ): unknown {
    const result = v.safeParse(NodePropertySchemas[property], value);
    if (!result.success) {
      Log.error(`The value of ${property} is not valid`, 'type');
    }

    if (property === 'imageSize' && node.image.src === '') {
      Log.error('The node does not have an image');
    }

    const previousValue = Utils.get(node, PropertyMapping[property]);
    const nextValue =
      result.output ?? (typeof previousValue === 'string' ? '' : previousValue);

    // A remote colors sync sends the branch color with the other colors,
    // unchanged, so a root accepts its own value without an error.
    if (
      property === 'branchColor' &&
      !node.parent &&
      nextValue !== node.colors.branch
    ) {
      Log.error('A root node has no branches');
    }

    return nextValue;
  }

  private static sameValue(a: unknown, b: unknown): boolean {
    if (Utils.isPureObjectType(a) && Utils.isPureObjectType(b)) {
      return JSON.stringify(a) === JSON.stringify(b);
    }
    return a === b;
  }

  /** Write the value at the property's path in the node model. */
  private writeProperty(node: Node, property: NodeProperty, value: unknown) {
    const path = PropertyMapping[property];
    const key = path[path.length - 1];
    const owner = path
      .slice(0, -1)
      .reduce<Record<string, unknown>>(
        (target, segment) => target[segment] as Record<string, unknown>,
        node as unknown as Record<string, unknown>
      );

    owner[key] = Utils.isPureObjectType(value) ? { ...value } : value;
  }

  /**
   * Remove the selected node.
   * @param {string} id
   */
  public removeNode = (id?: string, notifyWithEvent = true) => {
    const node = this.getTargetNode(id);
    if (!node) return;

    if (this.refusesLocalRemoval(node, notifyWithEvent)) return;

    if (!node.isRoot) {
      this.store.delete(node.id);

      this.getDescendants(node).forEach((node: Node) => {
        this.store.delete(node.id);
      });

      this.map.draw.clear();
      this.map.draw.update();

      this.map.history.save();

      if (notifyWithEvent) {
        this.map.events.emit('nodeRemove', this.getNodeProperties(node));
      }

      // Deselect only when the removal deleted the selected node or one of
      // its ancestors.
      if (this.selectedNode && !this.store.has(this.selectedNode.id)) {
        this.deselectNode();
      } else {
        this.redrawSelectionRing();
      }
    } else {
      Log.error('The root node can not be deleted');
    }
  };

  /**
   * Return the id of the node carrying the protection of the node with `id`,
   * or of the selected node: the node itself or its nearest protected
   * ancestor. Null when the node is not protected or nothing is selected.
   * @param {string} id
   * @returns {string | null}
   */
  public protectingNode = (id?: string): string | null => {
    const node = this.getTargetNode(id);
    return node ? (this.store.protectingNode(node)?.id ?? null) : null;
  };

  /**
   * Tell whether the node or one of its ancestors carries the protection.
   * @param {Node} node
   * @returns {boolean}
   */
  public isProtected(node: Node): boolean {
    return this.protectingNode(node.id) !== null;
  }

  /**
   * Refuse a local change of the node when its branch is protected: announce
   * the refusal and return true. A remote write arrives with notifyWithEvent
   * false, and the method lets it through.
   * @param {Node} node
   * @param {boolean} notifyWithEvent
   * @returns {boolean}
   */
  public refusesLocalChange(node: Node, notifyWithEvent = true): boolean {
    if (!notifyWithEvent || !this.isProtected(node)) return false;

    this.refuseProtected(node);
    return true;
  }

  /**
   * Refuse a local removal of the node when the node is protected or holds a
   * protected descendant, since the removal would delete a protected node.
   * @param {Node} node
   * @param {boolean} notifyWithEvent
   * @returns {boolean}
   */
  public refusesLocalRemoval(node: Node, notifyWithEvent = true): boolean {
    if (!notifyWithEvent) return false;
    if (this.refusesLocalChange(node)) return true;
    if (!this.getDescendants(node).some(descendant => descendant.protected)) {
      return false;
    }

    this.refuseProtected(node);
    return true;
  }

  /**
   * Announce that a protected branch refused a local edit of the node.
   * @param {Node} node
   */
  public refuseProtected(node: Node) {
    this.map.events.emit('nodeProtected', this.getNodeProperties(node));
  }

  /**
   * Protect the node with `id`, or the selected node, and every node below
   * it. The method clears the flag of every protected descendant, so each
   * path from a root to a leaf holds at most one flag. A node that is
   * already protected stays as it is. The caller wraps the call in one sync
   * transaction when it needs peers to receive the writes together.
   * @param {string} id
   */
  public protectBranch = (id?: string) => {
    const node = this.getTargetNode(id);
    if (!node || this.isProtected(node)) return;

    this.getDescendants(node)
      .filter(descendant => descendant.protected)
      .forEach(descendant =>
        this.updateNode('protected', false, true, false, descendant.id)
      );
    this.updateNode('protected', true, true, false, node.id);
    this.map.history.save();
  };

  /**
   * Release the protection of the branch the node with `id`, or the selected
   * node, belongs to, which releases every node below the protecting node.
   * @param {string} id
   */
  public releaseBranch = (id?: string) => {
    const protecting = this.protectingNode(id);
    if (protecting === null) return;

    this.updateNode('protected', false, true, true, protecting);
  };

  /**
   * Return the children of the node.
   * @param {string} id
   * @returns {ExportNodeProperties[]}
   */
  public nodeChildren = (id?: string): ExportNodeProperties[] => {
    const node = this.getTargetNode(id);
    if (!node) return [];

    return this.getChildren(node).map((n: Node) => this.getNodeProperties(n));
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
      protected: node.protected,
      isRoot: node.isRoot,
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
    // Arrow keys move no selection while nothing is selected.
    const selected = this.selectedNode;

    switch (direction) {
      case 'up':
      case 'down':
        if (selected) this.moveSelectionOnLevel(selected, direction === 'up');
        return true;
      case 'left':
      case 'right':
        if (selected) {
          this.moveSelectionOnBranch(selected, direction === 'left');
        }
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
    return this.store.children(node);
  }

  /**
   * Return whether a node is left of the root of its own tree (true if left).
   * A root has no side and returns undefined.
   * @return {boolean}
   */
  public getOrientation(node: Node): boolean | undefined {
    return this.store.orientation(node);
  }

  /**
   * Return the root of the tree a node belongs to.
   * @returns {Node} root
   */
  public getTreeRoot(node: Node): Node {
    return this.store.treeRoot(node);
  }

  /**
   * Returns the coordinates for the root of a new tree whose nodes take
   * `footprint`, given relative to the root. The search starts in the middle
   * of the viewport and returns the nearest point where the footprint keeps
   * NEW_TREE_GAP clear of the bounding box of every tree this client holds,
   * inside the viewport or not. The client writes these coordinates with the
   * root, so the root keeps them from then on.
   *
   * Without a viewport to measure, as in jsdom, the root goes twice
   * NODE_HORIZONTAL_SPACING right of the bounding box of every node, level
   * with the main root. `pickColumn` puts a root's first child one spacing to
   * its left, so the second spacing keeps that column clear of the other
   * trees.
   * @param {Bounds} footprint
   * @returns {MapNodeCoordinates} coordinates
   */
  public newTreeCoordinates = (
    footprint: Bounds = NEW_TREE_FOOTPRINT
  ): MapNodeCoordinates => {
    const view = this.map.zoom.visibleArea();
    if (!view) return this.rightOfEveryTree();

    const start = {
      x: (view.minX + view.maxX) / 2,
      y: (view.minY + view.maxY) / 2,
    };
    const trees = treeBounds(this.getNodes(), node => this.getTreeRoot(node));

    return findClearSpot(start, footprint, trees, NEW_TREE_GAP);
  };

  /**
   * Add the root of a new tree at `newTreeCoordinates`, then select it and
   * pan the view the shortest distance that shows it. The root has no parent
   * and no main-root mark. The frontend's nodeCreate handler may select the
   * root already. addTree selects it anyway, so the mmp API does not depend
   * on that handler.
   * @returns {Node} the new root
   */
  public addTree = (): Node => {
    const root = this.addNode(
      { name: '', coordinates: this.newTreeCoordinates() },
      true,
      true,
      null
    );
    this.selectNode(root.id);
    this.map.zoom.panIntoView(nodeBounds(root));

    return root;
  };

  private rightOfEveryTree(): MapNodeCoordinates {
    const rightEdge = this.getNodes().reduce(
      (edge, node) =>
        Math.max(edge, node.coordinates.x + node.dimensions.width / 2),
      -Infinity
    );

    return {
      x: rightEdge + 2 * NODE_HORIZONTAL_SPACING,
      y: this.getRoot().coordinates.y,
    };
  }

  /**
   * Return all descendants of a node.
   * @returns {Node[]} nodes
   */
  public getDescendants(node: Node): Node[] {
    return this.store.descendants(node);
  }

  /**
   * Return an array of all nodes.
   */
  public getNodes(): Node[] {
    return this.store.all();
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
  public setNode(node: Node) {
    this.store.set(node);
  }

  /**
   * Return the current selected node, or null when nothing is selected.
   * @returns {Node | null}
   */
  public getSelectedNode = (): Node | null => {
    return this.selectedNode;
  };

  /**
   * Select the main root: draw its ring and fire `nodeSelect`.
   */
  public selectRootNode() {
    // A full draw replaces every node object. Drop a selected node the map no
    // longer holds and fire no deselect: its DOM is detached, and a blur there
    // would commit a name edit.
    const selected = this.selectedNode;
    if (selected && this.store.get(selected.id) !== selected) {
      this.selectedNode = null;
    }

    const root = this.getRoot();
    this.selectNode(root.id);

    // selectNode draws no ring on a main root without a background colour,
    // and the main root still takes the selection.
    if (this.selectedNode !== root) {
      this.releaseSelection(root);
      this.announceSelection(root);
    }
  }

  /**
   * Delete all nodes.
   */
  public clear() {
    this.store.clear();
  }

  /**
   * Return the root node.
   * @returns {Node} rootNode
   */
  public getRoot = (): Node => {
    const root = this.store.get(this.map.rootId);

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
      return this.store.get(id);
    }
    return undefined;
  };

  /**
   * Return the siblings of a node.
   * @param {Node} node
   * @returns {Array<Node>} siblings
   */
  private getSiblings(node: Node): Node[] {
    return this.store.siblings(node);
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

    return { x: anchorX + column, y: this.stackBelow(anchorY, siblings) };
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
  private stackBelow(anchorY: number, siblings: Node[]): number {
    if (siblings.length > 0) {
      const lowerNode = this.getLowerNode(siblings);
      return (lowerNode?.coordinates?.y ?? 0) + NODE_VERTICAL_SIBLING_OFFSET;
    }

    return anchorY - NODE_VERTICAL_SPACING;
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
    this.map.draw.redrawBranches();
    this.map.draw.update();
    this.map.history.save();

    if (notifyWithEvent) {
      this.map.events.emit('distribute', undefined);
    }
  };

  /** Move one node, leaving the branch redraw to the caller. */
  private moveNodeTo(id: string, coordinates: MapNodeCoordinates): void {
    const node = this.store.get(id);
    if (!node) return;

    node.coordinates = { x: coordinates.x, y: coordinates.y };
    node.dom?.setAttribute(
      'transform',
      'translate(' + [coordinates.x, coordinates.y] + ')'
    );
  }

  private toLayoutInput(): LayoutInputNode[] {
    return this.store.all().map(node => ({
      id: node.id,
      parent: node.parent ? node.parent.id : '',
      isRoot: node.isRoot,
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
   * Move the node selection on the level of the selected node (true: up).
   * @param {Node} selected
   * @param {boolean} direction
   */
  private moveSelectionOnLevel(selected: Node, direction: boolean) {
    const parent = selected.parent;

    if (parent) {
      let siblings = this.getSiblings(selected).filter((node: Node) => {
        return direction === node.coordinates.y < selected.coordinates.y;
      });

      if (!parent.parent) {
        siblings = siblings.filter((node: Node) => {
          return this.getOrientation(node) === this.getOrientation(selected);
        });
      }

      if (siblings.length > 0) {
        let closerNode: Node = siblings[0],
          tmp = Math.abs(siblings[0].coordinates.y - selected.coordinates.y);

        for (const node of siblings) {
          const distance = Math.abs(
            node.coordinates.y - selected.coordinates.y
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
   * @param {Node} selected
   * @param {boolean} direction
   */
  private moveSelectionOnBranch(selected: Node, direction: boolean) {
    const orientation = this.getOrientation(selected);
    const parent = selected.parent;
    const movesToParent =
      (!orientation && direction) || (orientation && !direction);

    // A root has no parent and no orientation, so it always moves to a child
    // on the requested side.
    if (movesToParent && parent) {
      this.selectNode(parent.id);
      return;
    }

    let children = this.getChildren(selected);

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
