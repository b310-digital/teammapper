import Node, { NodeProperties } from '../models/node.js';
import NodeStore from '../models/node-store.js';
import type { NodeView } from './node-view.js';
import MmpMap from '../map.js';
import * as d3 from 'd3';
import * as v from 'valibot';
import { v4 as uuidv4 } from 'uuid';
import {
  collectSubtreeIds,
  CssColorSchema,
  NodePropertySchemas,
} from '@teammapper/shared';
import Log from '../../utils/log.js';
import Utils from '../../utils/utils.js';
import { isNodeProperty, PropertyMapping } from '../data/property-mapping.js';
import type { ResolvedNode } from '../data/node-record.js';
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

/**
 * Reads the record of a node: straight from the node store, or from the
 * records one draw pass or one scan already read.
 */
export type RecordLookup = (id: string) => ResolvedNode | undefined;

/**
 * Manage the nodes of the map. Nodes keeps the selected node's id and
 * resolves the node on each use. The tree queries take node ids and return
 * ids or records.
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
  // deselectNode and clear set this to null. A map load selects the main root.
  private selectedId: string | null = null;

  /**
   * The node with `id` as a record, read from the node store. The record
   * shares the style objects of the node, so a caller only reads it.
   * @param {string} id
   */
  public record = (id: string): ResolvedNode | undefined => {
    const node = this.store.get(id);
    return node ? Nodes.recordOf(node) : undefined;
  };

  /**
   * Every node, read in one scan of the node store, by id. For a user
   * action only.
   */
  public scan(): Map<string, ResolvedNode> {
    return new Map(
      this.store.all().map(node => [node.id, Nodes.recordOf(node)])
    );
  }

  private static recordOf(node: Node): ResolvedNode {
    return {
      id: node.id,
      parent: node.parent?.id ?? '',
      k: node.k,
      name: node.name,
      coordinates: node.coordinates,
      image: node.image,
      colors: node.colors,
      font: node.font,
      link: node.link,
      protected: node.protected,
      isRoot: node.isRoot,
    };
  }

  /**
   * The id of the node's parent, or null for a root. A node whose parent
   * the node store lacks counts as a root.
   * @param {string} id
   * @param {RecordLookup} lookup
   */
  public parentOf(id: string, lookup: RecordLookup = this.record) {
    const parent = lookup(id)?.parent;
    return parent && lookup(parent) ? parent : null;
  }

  /**
   * The ids along the parents of the node, nearest first. A parent cycle
   * stops at the node that closes it.
   */
  private ancestors(id: string, lookup: RecordLookup): string[] {
    const visited = new Set<string>([id]);
    const ancestors: string[] = [];

    for (
      let parent = this.parentOf(id, lookup);
      parent !== null && !visited.has(parent);
      parent = this.parentOf(parent, lookup)
    ) {
      visited.add(parent);
      ancestors.push(parent);
    }
    return ancestors;
  }

  /**
   * The id of the root of the tree the node belongs to.
   * @param {string} id
   * @param {RecordLookup} lookup
   */
  public treeRoot(id: string, lookup: RecordLookup = this.record): string {
    return this.ancestors(id, lookup).pop() ?? id;
  }

  /**
   * The depth of the node in its tree: 1 for a root.
   * @param {string} id
   * @param {RecordLookup} lookup
   */
  public level(id: string, lookup: RecordLookup = this.record): number {
    return this.ancestors(id, lookup).length + 1;
  }

  /**
   * Tell whether the view state hides the node: one of its ancestors hides
   * its child nodes. Without hidden child nodes no walk runs.
   * @param {string} id
   * @param {RecordLookup} lookup
   */
  public isHidden(id: string, lookup: RecordLookup = this.record): boolean {
    const viewState = this.map.viewState;
    if (viewState.isEmpty()) return false;

    return this.ancestors(id, lookup).some(ancestor =>
      viewState.hidesChildren(ancestor)
    );
  }

  /**
   * Where the node is drawn: its drag preview, or the coordinates of its
   * record.
   * @param {string} id
   * @param {RecordLookup} lookup
   */
  public positionOf(
    id: string,
    lookup: RecordLookup = this.record
  ): MapNodeCoordinates {
    const position = this.map.draw.previewOf(id) ??
      lookup(id)?.coordinates ?? { x: 0, y: 0 };
    return { x: position.x, y: position.y };
  }

  /**
   * Whether the node is drawn left of the root of its own tree. A root has
   * no side and returns undefined. The drag preview counts, so a dragged
   * node mirrors its descendants as it crosses its tree root.
   * @param {string} id
   * @param {RecordLookup} lookup
   */
  public orientation(
    id: string,
    lookup: RecordLookup = this.record
  ): boolean | undefined {
    if (this.parentOf(id, lookup) === null) return undefined;

    const root = this.treeRoot(id, lookup);
    return this.positionOf(id, lookup).x < this.positionOf(root, lookup).x;
  }

  /**
   * The children of the node, in the order of the node store. Scans every
   * node once.
   * @param {string} id
   */
  public children(id: string): ResolvedNode[] {
    return [...this.scan().values()].filter(
      node => node.parent === id && node.id !== id
    );
  }

  /**
   * The other children of the node's parent, none for a root. Scans every
   * node once.
   * @param {string} id
   */
  private siblings(id: string): ResolvedNode[] {
    const parent = this.parentOf(id);
    if (parent === null) return [];

    return this.children(parent).filter(node => node.id !== id);
  }

  /**
   * The ids of every node below the node. Scans every node once.
   * @param {string} id
   */
  public descendants(id: string): string[] {
    return collectSubtreeIds([...this.scan().values()], id);
  }

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
    const [, notifyWithEvent = true, parentId] = args;
    const parentNode = this.resolveParent(parentId);
    if (parentNode && this.refusesLocalChange(parentNode.id, notifyWithEvent)) {
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
    parentId?: string | null,
    overwriteId?: string
  ): Node => {
    const node = this.insertNode(userProperties, parentId, overwriteId);

    this.map.draw.update();

    if (notifyWithEvent) {
      this.map.events.emit('nodeCreate', this.getNodeProperties(node));
    }
    return node;
  };

  /**
   * Add a node like addNode, without drawing it or emitting an event. A
   * caller that adds several nodes draws once after the last.
   */
  public insertNode(
    userProperties?: UserNodeProperties,
    parentId?: string | null,
    overwriteId?: string
  ): Node {
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

    const node: Node = new Node(properties);

    if (
      !properties.coordinates?.x &&
      !properties.coordinates?.y &&
      parentNode
    ) {
      node.coordinates = this.calculateCoordinates(parentNode.id, this.record);
    }

    this.store.set(node);

    return node;
  }

  /**
   * The parent a node added through addNode gets: none for an explicit null,
   * the named node for an id, the selected node otherwise. Throws when the
   * caller names no parent and nothing is selected, because a new root node
   * would hide the caller's mistake.
   */
  private resolveParent(parentId: string | null | undefined): Node | null {
    if (parentId === null) return null;
    if (parentId) return this.getNode(parentId) ?? null;
    if (!this.selectedId) Log.error('There is no selected node');

    return this.getSelectedNode();
  }

  /**
   * Adds multiple nodes at once and draws once. A node with an empty parent
   * becomes a root, whatever node is selected.
   * @param {ExportNodeProperties[]} nodes
   */
  public addNodes = (nodes: ExportNodeProperties[]) => {
    let added = false;
    nodes.forEach(node => {
      if (!this.existNode(node.id)) {
        this.insertNode(node, node.parent || null, node.id);
        added = true;
      }
    });
    if (added) this.map.draw.update();
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
          const color = this.map.draw.ringColor(node);

          if (color && this.map.draw.ringOf(id) !== color) {
            this.releaseSelection(id);

            this.map.draw.setRing(id, color);

            this.announceSelection(node);
          }
        } else {
          Log.error('The node id or the direction is not correct');
        }
      }
    }

    const selected = this.getSelectedNode();
    return selected ? this.getNodeProperties(selected) : null;
  };

  /**
   * Draw the ring on the selected node again. A full draw of the map gives
   * every node a new DOM without the ring.
   */
  public redrawSelectionRing() {
    const selected = this.getSelectedNode();
    if (!selected) return;

    const color = this.map.draw.ringColor(selected);
    if (color) this.map.draw.setRing(selected.id, color);
  }

  /**
   * Make the node the selected node and tell listeners it took the selection.
   * @param {Node} node
   */
  private announceSelection(node: Node) {
    this.selectedId = node.id;
    this.map.events.emit('nodeSelect', this.getNodeProperties(node));
  }

  /**
   * Clear the ring and the focus of the selected node, leave nothing
   * selected, and tell listeners the node lost the selection. `next` names
   * the node about to take the selection, or null for a deselect. A removal
   * passes the selected node it took from the store as `removed`, so the
   * event still carries the node.
   * @param {string | null} next
   * @param {Node} removed
   */
  private releaseSelection(next: string | null, removed?: Node) {
    const previous = this.selectedId;
    if (previous === null) return;
    const node = removed ?? this.store.get(previous);

    this.map.draw.setRing(previous, null);

    // Keep focus on the node the user is editing (#1249): on mobile,
    // d3-drag's `started` callback fires on the second tap that enters edit
    // mode and calls selectNode for the same node, which used to steal focus
    // from the just-focused contenteditable and stop the soft keyboard from
    // opening.
    const editingSameNode =
      previous === next && this.map.draw.isEditing(previous);
    if (!editingSameNode) {
      Utils.removeAllRanges();
      this.map.draw.blurName(previous);
    }

    // The blur runs first: the name editor's onblur commits the name through
    // updateNode without an id, which targets the selected node.
    this.selectedId = null;
    // For a node the store no longer holds, the event carries its id alone.
    this.map.events.emit(
      'nodeDeselect',
      node ? this.getNodeProperties(node) : { id: previous, parent: '', k: 0 }
    );
  }

  /**
   * Draw a ring in `color` around the node, as a peer's selection does. A
   * peer picks its own color, so an invalid one draws nothing.
   * @param {string} id
   * @param {string} color
   */
  public highlightNodeWithColor = (id: string, color: string): void => {
    if (!this.store.has(id)) Log.error('The node id is not correct');
    if (!v.is(CssColorSchema, color)) return;

    this.map.draw.setRing(id, color);
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
    if (this.selectedId) {
      this.map.draw.enableNodeNameEditing(this.selectedId);
    }
  };

  /**
   * Hide the child nodes of the selected node, or show them again, in the
   * view state and announce the new view state. The toggle skips a node
   * without child nodes, unless the view state already lists it. A node
   * further down keeps its own child nodes hidden.
   */
  public toggleBranchVisibility = () => {
    const id = this.getSelectedNode()?.id;
    if (!id) return;

    const viewState = this.map.viewState;
    if (!viewState.hidesChildren(id) && this.children(id).length === 0) {
      return;
    }

    viewState.toggle(id);
    this.map.draw.update();
    this.map.events.emit('viewStateChange', viewState.export());
  };

  /**
   * Tell whether the view state hides the child nodes of the node with `id`.
   * Without an `id`, the method asks about the selected node and returns
   * false when nothing is selected. A node without child nodes returns false
   * and shows no eye mark.
   * @param {string} id
   * @returns {boolean}
   */
  public childNodesHidden = (id?: string): boolean => {
    const node = this.getTargetNode(id);
    if (!node) return false;
    return (
      this.map.viewState.hidesChildren(node.id) &&
      this.children(node.id).length > 0
    );
  };

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
    if (!id) return this.getSelectedNode();

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
    id?: string
  ) => {
    const node = this.getTargetNode(id);
    if (!node) return;

    if (typeof property !== 'string' || !isNodeProperty(property)) {
      Log.error('The property does not exist');
    }

    // Changing the protection itself stays allowed.
    const guarded = property !== 'protected';
    if (guarded && this.refusesLocalChange(node.id, notifyWithEvent)) return;

    const previousValue = Utils.get(node, PropertyMapping[property]);
    const nextValue = this.validatedValue(node, property, value);
    if (Nodes.sameValue(previousValue, nextValue)) return;

    this.writeProperty(node, property, nextValue);
    this.view.renderNodeProperty(node.id, property);

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

    if (this.refusesLocalRemoval(node.id, notifyWithEvent)) return;

    if (!node.isRoot) {
      const removed = [node.id, ...this.descendants(node.id)].flatMap(
        removedId => this.store.get(removedId) ?? []
      );
      removed.forEach(node => this.store.delete(node.id));
      const forgotten = this.map.viewState.forget(removed.map(node => node.id));

      this.map.draw.clear();
      this.map.draw.update();

      if (notifyWithEvent) {
        this.map.events.emit('nodeRemove', this.getNodeProperties(node));
      }
      if (forgotten) {
        this.map.events.emit('viewStateChange', this.map.viewState.export());
      }

      // Deselect only when the removal deleted the selected node or one of
      // its ancestors.
      const selected = removed.find(
        removedNode => removedNode.id === this.selectedId
      );
      if (selected) {
        this.releaseSelection(null, selected);
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
    if (!node) return null;

    return (
      [node.id, ...this.ancestors(node.id, this.record)].find(
        candidate => this.record(candidate)?.protected
      ) ?? null
    );
  };

  /**
   * Tell whether the node or one of its ancestors carries the protection.
   * @param {string} id
   * @returns {boolean}
   */
  public isProtected(id: string): boolean {
    return this.protectingNode(id) !== null;
  }

  /**
   * Refuse a local change of the node when its branch is protected: announce
   * the refusal and return true. A remote write arrives with notifyWithEvent
   * false, and the method lets it through.
   * @param {string} id
   * @param {boolean} notifyWithEvent
   * @returns {boolean}
   */
  public refusesLocalChange(id: string, notifyWithEvent = true): boolean {
    if (!notifyWithEvent || !this.isProtected(id)) return false;

    this.refuseProtected(id);
    return true;
  }

  /**
   * Refuse a local removal of the node when the node is protected or holds a
   * protected descendant, since the removal would delete a protected node.
   * @param {string} id
   * @param {boolean} notifyWithEvent
   * @returns {boolean}
   */
  public refusesLocalRemoval(id: string, notifyWithEvent = true): boolean {
    if (!notifyWithEvent) return false;
    if (this.refusesLocalChange(id)) return true;

    const records = this.scan();
    const holdsProtected = collectSubtreeIds([...records.values()], id).some(
      descendant => records.get(descendant)?.protected
    );
    if (!holdsProtected) return false;

    this.refuseProtected(id);
    return true;
  }

  /**
   * Announce that a protected branch refused a local edit of the node.
   * @param {string} id
   */
  public refuseProtected(id: string) {
    const node = this.exportNode(id);
    if (node) this.map.events.emit('nodeProtected', node);
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
    if (!node || this.isProtected(node.id)) return;

    const records = this.scan();
    collectSubtreeIds([...records.values()], node.id)
      .filter(descendant => records.get(descendant)?.protected)
      .forEach(descendant =>
        this.updateNode('protected', false, true, descendant)
      );
    this.updateNode('protected', true, true, node.id);
  };

  /**
   * Release the protection of the branch the node with `id`, or the selected
   * node, belongs to, which releases every node below the protecting node.
   * @param {string} id
   */
  public releaseBranch = (id?: string) => {
    const protecting = this.protectingNode(id);
    if (protecting === null) return;

    this.updateNode('protected', false, true, protecting);
  };

  /**
   * Return the children of the node.
   * @param {string} id
   * @returns {ExportNodeProperties[]}
   */
  public nodeChildren = (id?: string): ExportNodeProperties[] => {
    const node = this.getTargetNode(id);
    if (!node) return [];

    return this.children(node.id).flatMap(
      child => this.exportNode(child.id) ?? []
    );
  };

  /**
   * Return a copy of the node, which the caller may change, or null when the
   * node store lacks the node.
   * @param {string} id
   * @returns {ExportNodeProperties | null}
   */
  public exportNode(id: string): ExportNodeProperties | null {
    const node = this.store.get(id);
    return node ? this.getNodeProperties(node) : null;
  }

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
    const selected = this.selectedId ? this.record(this.selectedId) : null;

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
    const records = this.scan();
    const lookup: RecordLookup = id => records.get(id);
    const trees = treeBounds(
      [...records.values()],
      node => records.get(this.treeRoot(node.id, lookup)) ?? node,
      this.boundsOf
    );

    return findClearSpot(start, footprint, trees, NEW_TREE_GAP);
  };

  /**
   * Add the root of a new tree at `newTreeCoordinates`, then select it and
   * pan the view the shortest distance that shows it. The root has no parent
   * and its isRoot attribute is false. The frontend's nodeCreate handler may select the
   * root already. addTree selects it anyway, so the mmp API does not depend
   * on that handler.
   * @returns {Node} the new root
   */
  public addTree = (): Node => {
    const root = this.addNode(
      { name: '', coordinates: this.newTreeCoordinates() },
      true,
      null
    );
    this.selectNode(root.id);
    this.map.zoom.panIntoView(this.boundsOf(root));

    return root;
  };

  private rightOfEveryTree(): MapNodeCoordinates {
    const rightEdge = [...this.scan().values()].reduce(
      (edge, node) => Math.max(edge, this.boundsOf(node).maxX),
      -Infinity
    );

    return {
      x: rightEdge + 2 * NODE_HORIZONTAL_SPACING,
      y: this.getRoot().coordinates.y,
    };
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
    return this.selectedId ? (this.store.get(this.selectedId) ?? null) : null;
  };

  /**
   * Select the main root: draw its ring and fire `nodeSelect`.
   */
  public selectRootNode() {
    const root = this.getRoot();
    this.selectNode(root.id);

    // selectNode draws no ring on a main root without a background colour,
    // and the main root still takes the selection.
    if (this.selectedId !== root.id) {
      this.releaseSelection(root.id);
      this.announceSelection(root);
    }
  }

  /**
   * Delete all nodes. The selection drops without `nodeDeselect`: a map
   * load clears the nodes before it draws them anew, the old DOM goes, and
   * a blur there would commit a name edit.
   */
  public clear() {
    this.store.clear();
    this.selectedId = null;
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
   * Return the main root, or null for a map without one.
   * @returns {ResolvedNode | null}
   */
  public mainRoot(): ResolvedNode | null {
    return this.record(this.map.rootId) ?? null;
  }

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
   * Where a node added interactively under `parent` goes: one column out
   * from its parent and below its lowest sibling.
   */
  private calculateCoordinates(
    parent: string,
    lookup: RecordLookup
  ): MapNodeCoordinates {
    const anchor = lookup(parent)?.coordinates ?? { x: 0, y: 0 };
    const { column, siblings } = this.pickColumn(parent, lookup);

    return { x: anchor.x + column, y: this.stackBelow(anchor.y, siblings) };
  }

  /**
   * The column mmp places a new node under `parent` in, as an offset from
   * the parent, plus the siblings sharing that column. A child of a root takes
   * the side of its tree that currently holds fewer siblings.
   */
  private pickColumn(
    parent: string,
    lookup: RecordLookup
  ): { column: number; siblings: ResolvedNode[] } {
    const siblings = this.children(parent);

    if (this.parentOf(parent, lookup) === null) {
      const [left, right] = this.splitByOrientation(siblings);
      return left.length <= right.length
        ? { column: -NODE_HORIZONTAL_SPACING, siblings: left }
        : { column: NODE_HORIZONTAL_SPACING, siblings: right };
    }

    const goesLeft = !!this.orientation(parent, lookup);
    const column = goesLeft
      ? -NODE_HORIZONTAL_SPACING
      : NODE_HORIZONTAL_SPACING;

    return { column, siblings };
  }

  private splitByOrientation(
    siblings: ResolvedNode[]
  ): [ResolvedNode[], ResolvedNode[]] {
    const left: ResolvedNode[] = [];
    const right: ResolvedNode[] = [];

    for (const sibling of siblings) {
      (this.orientation(sibling.id) ? left : right).push(sibling);
    }

    return [left, right];
  }

  /** Below the lowest sibling, or just above the parent when there is none. */
  private stackBelow(anchorY: number, siblings: ResolvedNode[]): number {
    const lowerNode = Nodes.lowerNode(siblings);
    if (lowerNode) {
      return lowerNode.coordinates.y + NODE_VERTICAL_SIBLING_OFFSET;
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

    const layout = computeMapLayout(mapSnapshot, this.map.draw.estimateExtent);

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
   * sizes, discarding manual positioning. The distribute event makes the
   * frontend write the result in one Y.Doc transaction, so one undo reverts
   * the whole rewrite.
   */
  public distributeNodes = (notifyWithEvent = true) => {
    const records = this.scan();
    const layout = computeMapLayout(
      [...records.values()].map(node => this.toLayoutInput(node)),
      this.map.draw.estimateExtent
    );
    if (layout.size === 0) return;

    for (const [id, coordinates] of layout) {
      this.moveNodeTo(id, coordinates);
    }

    this.map.draw.update();

    if (notifyWithEvent) {
      this.map.events.emit('distribute', undefined);
    }
  };

  /** Move one node, leaving the drawing to the caller. */
  private moveNodeTo(id: string, coordinates: MapNodeCoordinates): void {
    const node = this.store.get(id);
    if (!node) return;

    node.coordinates = { x: coordinates.x, y: coordinates.y };
  }

  /**
   * The bounding box of the node as it is drawn, or as it will be drawn
   * before the renderer has measured it.
   * @param {ResolvedNode} node
   */
  public boundsOf = (
    node: Pick<ResolvedNode, 'id' | 'name' | 'font' | 'coordinates'>
  ): Bounds =>
    nodeBounds({
      coordinates: node.coordinates,
      dimensions: this.map.draw.dimensionsOf(node),
    });

  private toLayoutInput(node: ResolvedNode): LayoutInputNode {
    return {
      id: node.id,
      parent: node.parent,
      isRoot: node.isRoot,
      name: node.name,
      font: node.font,
      coordinates: node.coordinates,
      dimensions: this.map.draw.dimensionsOf(node),
    };
  }

  /**
   * Return the lowest node of a list of nodes.
   * @param {ResolvedNode[]} nodes
   * @returns {ResolvedNode | undefined} lowerNode
   */
  private static lowerNode(nodes: ResolvedNode[]): ResolvedNode | undefined {
    if (nodes.length === 0) return;

    return nodes.reduce(
      (lowest, current) =>
        current.coordinates.y > lowest.coordinates.y ? current : lowest,
      nodes[0]
    );
  }

  /**
   * Move the node selection on the level of the selected node (true: up).
   * @param {ResolvedNode} selected
   * @param {boolean} direction
   */
  private moveSelectionOnLevel(selected: ResolvedNode, direction: boolean) {
    const parent = this.parentOf(selected.id);
    if (parent === null) return;

    let siblings = this.siblings(selected.id).filter(node => {
      return direction === node.coordinates.y < selected.coordinates.y;
    });

    if (this.parentOf(parent) === null) {
      const side = this.orientation(selected.id);
      siblings = siblings.filter(node => this.orientation(node.id) === side);
    }

    if (siblings.length === 0) return;

    let closerNode = siblings[0],
      tmp = Math.abs(siblings[0].coordinates.y - selected.coordinates.y);

    for (const node of siblings) {
      const distance = Math.abs(node.coordinates.y - selected.coordinates.y);

      if (distance < tmp) {
        tmp = distance;
        closerNode = node;
      }
    }

    this.selectNode(closerNode.id);
  }

  /**
   * Move the node selection in a child node or in the parent node (true: left)
   * @param {ResolvedNode} selected
   * @param {boolean} direction
   */
  private moveSelectionOnBranch(selected: ResolvedNode, direction: boolean) {
    const orientation = this.orientation(selected.id);
    const parent = this.parentOf(selected.id);
    const movesToParent =
      (!orientation && direction) || (orientation && !direction);

    // A root has no parent and no orientation, so it always moves to a child
    // on the requested side.
    if (movesToParent && parent) {
      this.selectNode(parent);
      return;
    }

    let children = this.children(selected.id);

    if (orientation === undefined) {
      // The selected node is a root
      children = children.filter(node => {
        return this.orientation(node.id) === direction;
      });
    }

    const lowerNode = Nodes.lowerNode(children);

    if (lowerNode) {
      this.selectNode(lowerNode.id);
    }
  }
}
