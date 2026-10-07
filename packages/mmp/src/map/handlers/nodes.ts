import MmpMap from '../map.js';
import * as v from 'valibot';
import { v4 as uuidv4 } from 'uuid';
import {
  collectSubtreeIds,
  CssColorSchema,
  NodePropertySchemas,
} from '@teammapper/shared';
import Log from '../../utils/log.js';
import Utils from '../../utils/utils.js';
import type { MapData, MapDataChange } from '../data/map-data.js';
import { isNodeProperty, PropertyMapping } from '../data/property-mapping.js';
import {
  randomK,
  resolveNode,
  type ResolvedNode,
} from '../data/node-record.js';
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
  MapNodeCoordinates,
  MapSnapshot,
  NodeProperty,
  NodePropertyValue,
  UserNodeProperties,
} from '@teammapper/shared';

const NODE_VERTICAL_SIBLING_OFFSET = 60; // The y-axis spacing between sibling nodes

/**
 * Reads the record of a node: straight from the map data, or from the
 * records one draw pass or one scan already read.
 */
export type RecordLookup = (id: string) => ResolvedNode | undefined;

/** The lookup over the records of one `Nodes.scan`. */
export const lookupIn =
  (records: ReadonlyMap<string, ResolvedNode>): RecordLookup =>
  id =>
    records.get(id);

/**
 * Read, change and select the nodes of the map. Nodes reads every attribute
 * through the map data and writes through its typed methods. Nodes keeps the
 * selected node's id and nothing else of the map. The change listener
 * `onChange` draws every change: a local write, a peer's write and an undo
 * take this one path.
 *
 * A change costs work in proportion to the nodes it adds, updates or removes.
 * The tree queries that walk up along the parents run per drawn node; the
 * ones that scan every node (children, siblings, descendants) run once per
 * user action and never per change, per draw or per drag frame.
 */
export default class Nodes {
  /**
   * Get the associated map instance.
   * @param {MmpMap} map
   */
  constructor(map: MmpMap) {
    this.map = map;
  }

  private map: MmpMap;

  // deselectNode sets this to null. A replaced map selects the main root.
  private selectedId: string | null = null;
  // The ring color mmp last drew on the selected node. A highlight may have
  // replaced the ring since, and refreshRing keeps it until the color changes.
  private selectionRing: string | null = null;

  private get data(): MapData {
    return this.map.data;
  }

  /**
   * Draw a change of the map data, keep the selection and the view state in
   * line with it, and announce it with `mapChange`.
   * @param {MapDataChange} change
   */
  public onChange = (change: MapDataChange) => {
    if (change.replaced) this.drawReplaced();
    else this.drawChange(change);

    this.map.viewState.forget(change.removed);
    this.map.events.emit('mapChange', undefined);
  };

  /**
   * Draw the whole map again, select the main root and center the view on
   * it. A running drag ends without a write, so a peer's import is never
   * overwritten. The selection drops without `nodeDeselect`: the old DOM is
   * gone, and a blur there would commit a name edit. A node that survives
   * the replacement keeps the rings of peers but not a stale selection ring.
   */
  public drawReplaced() {
    this.map.drag.cancel();
    if (this.selectedId !== null) this.map.draw.setRing(this.selectedId, null);
    this.map.draw.drawAll();
    this.selectedId = null;
    this.selectRootNode();
    this.map.zoom.center('position', 0);
  }

  /**
   * Draw the nodes a change added or updated, and drop the removed ones. For
   * a removed node, `drawChange` also redraws its parent, whose hidden child
   * nodes mark depends on its children. `drawNodes` redraws the parents and
   * the descendants a new or changed parent affects.
   */
  private drawChange({ added, updated, removed }: MapDataChange) {
    const redraw = this.map.draw.removeNodes(removed);
    this.map.draw.drawNodes([...added, ...updated, ...redraw]);

    const selected = this.selectedId;
    if (selected === null) return;
    if (!this.data.node(selected)) {
      this.deselectNode();
    } else if (updated.includes(selected)) {
      this.refreshRing(selected);
    }
  }

  /**
   * Draw the ring of the node again when its background changed: the ring
   * darkens along with it. Any other update keeps the ring the node carries,
   * which may be a highlight drawn after the selection.
   */
  private refreshRing(id: string) {
    const node = this.record(id);
    if (!node || this.map.draw.ringOf(id) === null) return;

    const color = this.map.draw.ringColor(node);
    if (color === this.selectionRing) return;

    this.selectionRing = color;
    this.map.draw.setRing(id, color);
  }

  /**
   * The node with `id`, every attribute filled, read from the map data.
   * @param {string} id
   */
  public record = (id: string): ResolvedNode | undefined => {
    const record = this.data.node(id);
    return record ? resolveNode(record) : undefined;
  };

  /**
   * Every node, read in one scan of the map data, by id. For a user action
   * only.
   */
  public scan(): Map<string, ResolvedNode> {
    return new Map(
      this.data.nodes().map(record => [record.id, resolveNode(record)])
    );
  }

  /**
   * The id of the node's parent, or null for a root. A node whose parent
   * the map data lacks counts as a root.
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
   * The position mmp draws the node at: its drag preview, or the coordinates
   * of its record.
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
   * The children of the node, in the order of the map data. Scans every
   * node once.
   * @param {string} id
   */
  public children(id: string): ResolvedNode[] {
    return this.data
      .nodes()
      .filter(node => node.parent === id && node.id !== id)
      .map(resolveNode);
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
    return collectSubtreeIds(this.data.nodes(), id);
  }

  /**
   * Add a node to the map and return a copy of it. The node takes the
   * defaults for every property the caller leaves out, and coordinates next
   * to its siblings when the caller passes none. The method refuses a child
   * of a protected branch: it announces the refusal and returns null. The
   * map does not select the new node.
   * @param {UserNodeProperties} userProperties
   * @param {string | null} parentId the parent's id, null to add a root, or
   * undefined to add a child of the selected node
   */
  public addNode = (
    userProperties?: UserNodeProperties,
    parentId?: string | null
  ): ExportNodeProperties | null => {
    const parent = this.resolveParent(parentId);
    if (parent !== null && this.refusesChange(parent)) return null;

    const record = this.newRecord(userProperties, parent);
    this.data.addNodes([record]);

    return this.exportNode(record.id);
  };

  /**
   * The record of a new node under `parent`, or of a new root for null.
   * `lookup` reads the parent and its tree, which may be records a paste has
   * not written yet.
   */
  public newRecord(
    userProperties: UserNodeProperties | undefined,
    parent: string | null,
    id: string = uuidv4(),
    lookup: RecordLookup = this.record
  ): ResolvedNode {
    const properties: UserNodeProperties = Utils.mergeObjects(
      this.map.options.defaultNode,
      userProperties,
      true
    );

    // A root draws no branch. Its children fall through to the automatic
    // branch colors, as the main root's children do.
    if (parent === null && userProperties?.colors?.branch === undefined) {
      properties.colors = { ...properties.colors, branch: '' };
    }

    const record = resolveNode({
      ...properties,
      id,
      parent,
      k: randomK(),
      protected: false,
    });

    if (!properties.coordinates?.x && !properties.coordinates?.y && parent) {
      record.coordinates = this.calculateCoordinates(parent, lookup);
    }
    return record;
  }

  /**
   * The parent a node added through addNode gets: none for an explicit null,
   * the named node for an id, the selected node otherwise. Throws when the
   * named parent is missing, such as one a peer just removed, and when the
   * caller names no parent and nothing is selected, because a new root node
   * would hide the caller's mistake.
   */
  private resolveParent(parentId: string | null | undefined): string | null {
    if (parentId === null) return null;
    if (parentId) {
      if (!this.data.node(parentId)) {
        Log.error('There are no nodes with id "' + parentId + '"');
      }
      return parentId;
    }
    if (!this.selectedId) Log.error('There is no selected node');

    return this.selectedId;
  }

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
        const node = this.record(id);
        if (node) {
          const color = this.map.draw.ringColor(node);

          if (color && this.map.draw.ringOf(id) !== color) {
            this.releaseSelection(id);

            this.selectionRing = color;
            this.map.draw.setRing(id, color);

            this.announceSelection(id);
          }
        } else {
          Log.error('The node id or the direction is not correct');
        }
      }
    }

    return this.getSelectedNode();
  };

  /**
   * Make the node the selected node and tell listeners it took the selection.
   * @param {string} id
   */
  private announceSelection(id: string) {
    this.selectedId = id;
    const node = this.exportNode(id);
    if (node) this.map.events.emit('nodeSelect', node);
  }

  /**
   * Clear the ring and the focus of the selected node, leave nothing
   * selected, and tell listeners the node lost the selection. `next` names
   * the node about to take the selection, or null for a deselect.
   * @param {string | null} next
   */
  private releaseSelection(next: string | null) {
    const previous = this.selectedId;
    if (!previous) return;

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
      // The blur commits a running name edit of the node.
      this.map.draw.blurName(previous);
    }

    this.selectedId = null;
    // For a node the map data no longer holds, the event carries its id alone.
    this.map.events.emit(
      'nodeDeselect',
      this.exportNode(previous) ?? { id: previous, parent: null, k: 0 }
    );
  }

  /**
   * Draw a ring in `color` around the node, as a peer's selection does. A
   * peer picks its own color, so an invalid one draws nothing.
   * @param {string} id
   * @param {string} color
   */
  public highlightNodeWithColor = (id: string, color: string): void => {
    if (!this.data.node(id)) Log.error('The node id is not correct');
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
      }

      return this.data.node(id) !== undefined;
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
   * view state, and redraw the branch. The toggle skips a node without child
   * nodes, unless the view state already lists it. A node further down keeps
   * its own child nodes hidden. Fires no event.
   */
  public toggleBranchVisibility = () => {
    const id = this.selectedId;
    if (!id) return;

    const viewState = this.map.viewState;
    if (!viewState.hidesChildren(id) && this.children(id).length === 0) {
      return;
    }

    viewState.toggle(id);
    this.map.draw.drawSubtree(id);
  };

  /**
   * Tell whether the view state hides the child nodes of the node with `id`.
   * Without an `id`, the method asks about the selected node and returns
   * false when nothing is selected. A node without child nodes returns false
   * and shows no hidden child nodes mark.
   * @param {string} id
   * @returns {boolean}
   */
  public childNodesHidden = (id?: string): boolean => {
    const node = this.getTargetNode(id);
    return node ? this.map.draw.hidesDrawnChildren(node.id) : false;
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
   * @returns {ResolvedNode | null}
   */
  public getTargetNode = (id?: string): ResolvedNode | null => {
    if (id && typeof id !== 'string') {
      Log.error('The node id must be a string', 'type');
    }
    const target = id || this.selectedId;
    if (!target) return null;

    const node = this.record(target);
    if (node === undefined) {
      Log.error('There are no nodes with id "' + target + '"');
    }

    return node;
  };

  /**
   * Write one property of the node with `id`, or of the selected node. The
   * value must pass the shared schema. A protected branch refuses every
   * property but `protected` itself, and an unchanged value writes nothing.
   */
  public updateNode = (
    property: NodeProperty | string,
    value: NodePropertyValue | unknown,
    id?: string
  ) => {
    const node = this.getTargetNode(id);
    if (!node) return;

    if (typeof property !== 'string' || !isNodeProperty(property)) {
      Log.error('The property does not exist');
    }

    // Changing the protection itself stays allowed.
    if (property !== 'protected' && this.refusesChange(node.id)) return;

    const previousValue = Utils.get(node, PropertyMapping[property]);
    const nextValue = this.validatedValue(node, property, value);
    if (Nodes.sameValue(previousValue, nextValue)) return;

    this.data.updateNode(node.id, property, nextValue);
  };

  /**
   * Check a new value of the property against the shared schema and the
   * node, and return the value the node takes. An empty value clears a
   * text property and leaves a number as it is.
   */
  private validatedValue(
    node: ResolvedNode,
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

    // A colors write carries the branch color with the other colors,
    // unchanged, so a root accepts its own value without an error.
    if (
      property === 'branchColor' &&
      this.parentOf(node.id) === null &&
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

  /**
   * Remove the node with `id`, or the selected node, with its descendants.
   * The main root and a branch holding a protected node stay.
   * @param {string} id
   */
  public removeNode = (id?: string) => {
    const node = this.getTargetNode(id);
    if (!node) return;

    if (this.refusesRemoval(node.id)) return;
    if (node.isRoot) Log.error('The root node can not be deleted');

    this.data.removeNode(node.id);
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
   * Refuse a change of the node when its branch is protected: announce the
   * refusal and return true.
   * @param {string} id
   * @returns {boolean}
   */
  public refusesChange(id: string): boolean {
    if (!this.isProtected(id)) return false;

    this.refuseProtected(id);
    return true;
  }

  /**
   * Refuse a removal of the node when the node is protected or holds a
   * protected descendant, since the removal would delete a protected node.
   * @param {string} id
   * @returns {boolean}
   */
  public refusesRemoval(id: string): boolean {
    if (this.refusesChange(id)) return true;

    const records = this.scan();
    const holdsProtected = collectSubtreeIds([...records.values()], id).some(
      descendant => records.get(descendant)?.protected
    );
    if (!holdsProtected) return false;

    this.refuseProtected(id);
    return true;
  }

  /**
   * Announce that a protected branch refused an edit of the node.
   * @param {string} id
   */
  public refuseProtected(id: string) {
    const node = this.exportNode(id);
    if (node) this.map.events.emit('nodeProtected', node);
  }

  /**
   * Protect the node with `id`, or the selected node, and every node below
   * it. The method sets `protected` to false on every protected descendant,
   * so each path from a root to a leaf holds at most one protected node. A
   * node that is already protected stays as it is. The writes form one batch.
   * @param {string} id
   */
  public protectBranch = (id?: string) => {
    const node = this.getTargetNode(id);
    if (!node || this.isProtected(node.id)) return;

    const records = this.scan();
    this.data.batch(() => {
      collectSubtreeIds([...records.values()], node.id)
        .filter(descendant => records.get(descendant)?.protected)
        .forEach(descendant => this.updateNode('protected', false, descendant));
      this.updateNode('protected', true, node.id);
    });
  };

  /**
   * Release the protection of the branch the node with `id`, or the selected
   * node, belongs to, which releases every node below the protecting node.
   * @param {string} id
   */
  public releaseBranch = (id?: string) => {
    const protecting = this.protectingNode(id);
    if (protecting === null) return;

    this.updateNode('protected', false, protecting);
  };

  /**
   * Return copies of the children of the node.
   * @param {string} id
   * @returns {ExportNodeProperties[]}
   */
  public nodeChildren = (id?: string): ExportNodeProperties[] => {
    const node = this.getTargetNode(id);
    if (!node) return [];

    return this.children(node.id);
  };

  /**
   * Return a copy of the node with every attribute filled, which the caller
   * may change, or null when the map data lacks the node.
   * @param {string} id
   * @returns {ExportNodeProperties | null}
   */
  public exportNode(id: string): ExportNodeProperties | null {
    return this.record(id) ?? null;
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
    const lookup = lookupIn(records);
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
   * and its isRoot attribute is false.
   * @returns {ExportNodeProperties | null} a copy of the new root
   */
  public addTree = (): ExportNodeProperties | null => {
    const root = this.addNode(
      { name: '', coordinates: this.newTreeCoordinates() },
      null
    );
    if (!root) return null;

    this.selectNode(root.id);
    this.map.zoom.panIntoView(this.boundsOf(resolveNode(root)));

    return root;
  };

  private rightOfEveryTree(): MapNodeCoordinates {
    const rightEdge = [...this.scan().values()].reduce(
      (edge, node) => Math.max(edge, this.boundsOf(node).maxX),
      -Infinity
    );

    return {
      x: rightEdge + 2 * NODE_HORIZONTAL_SPACING,
      y: this.mainRoot()?.coordinates.y ?? 0,
    };
  }

  /**
   * Return a copy of the selected node, or null when nothing is selected.
   * @returns {ExportNodeProperties | null}
   */
  public getSelectedNode = (): ExportNodeProperties | null => {
    return this.selectedId ? this.exportNode(this.selectedId) : null;
  };

  /**
   * Select the main root: draw its ring and fire `nodeSelect`. A map
   * without a main root selects nothing.
   */
  public selectRootNode() {
    const root = this.data.mainRootId();
    if (root === null) return;

    this.selectNode(root);

    // selectNode draws no ring on a main root without a background colour,
    // and the main root still takes the selection.
    if (this.selectedId !== root) {
      this.releaseSelection(root);
      this.announceSelection(root);
    }
  }

  /**
   * Return the main root, or null for a map without one.
   * @returns {ResolvedNode | null}
   */
  public mainRoot(): ResolvedNode | null {
    const id = this.data.mainRootId();
    return id === null ? null : (this.record(id) ?? null);
  }

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
   * the side of its tree that holds fewer siblings.
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
   * sizes, discarding manual positioning. The writes form one batch, so one
   * undo reverts the whole rewrite.
   */
  public distributeNodes = () => {
    const records = this.scan();
    const layout = computeMapLayout(
      [...records.values()].map(node => this.toLayoutInput(node)),
      this.map.draw.estimateExtent
    );
    if (layout.size === 0) return;

    this.writePositions(layout);
  };

  /**
   * Write the coordinates of the given nodes in one batch, and only those
   * that differ from the stored ones, so one undo reverts them all.
   * @param {Map<string, MapNodeCoordinates>} positions
   */
  public writePositions(positions: Map<string, MapNodeCoordinates>) {
    this.data.batch(() => {
      for (const [id, { x, y }] of positions) {
        const current = this.record(id)?.coordinates;
        if (!current || (current.x === x && current.y === y)) continue;

        this.data.updateNode(id, 'coordinates', { x, y });
      }
    });
  }

  /**
   * The bounding box of the node as it is drawn, or as it will be drawn
   * before the renderer has measured it.
   * @param {ResolvedNode} node
   */
  public boundsOf = (node: ResolvedNode): Bounds =>
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
