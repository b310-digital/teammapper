import * as d3 from 'd3';
import DOMPurify from 'dompurify';
import {
  isImageDataUrl,
  isImageReference,
  type MapNodeCoordinates,
  type MapNodeDimensions,
  type MapNodeFont,
} from '@teammapper/shared';
import MmpMap, { DomElements } from '../map.js';
import Utils from '../../utils/utils.js';
import type { MapNodeRecord } from '../data/map-data.js';
import { resolveNode, type ResolvedNode } from '../data/node-record.js';
import type { RecordLookup } from './nodes.js';
import {
  MIN_TEXT_EXTENT,
  measureNodeExtent,
  measureTextExtent,
  withPadding,
} from './node-geometry.js';
import {
  NODE_MARKS,
  nameElements,
  type LoadedImage,
  type MarkContext,
  type NodeGroups,
} from './node-marks.js';

type BranchPaths = d3.Selection<SVGPathElement, string, d3.BaseType, unknown>;

interface Layers {
  branches: d3.Selection<SVGGElement, unknown, null, undefined>;
  nodes: d3.Selection<SVGGElement, unknown, null, undefined>;
}

/** An image value the renderer loads, and how far the load got. */
interface ImageLoad {
  src: string;
  url: string;
  ratio: number | null;
}

/** The branch drawn to a node, and the parent it leaves from. */
interface DrawnBranch {
  path: SVGPathElement;
  parent: string;
}

/**
 * Draws the mind map and redraws the nodes a change adds or updates. d3 binds
 * node ids to the DOM. Each draw pass reads the record of each node it draws
 * once, through `recordOf`, and drops the records when it ends.
 *
 * The renderer keeps render data only: the DOM element of each drawn node
 * and branch, the parent each drawn branch leaves from, measured name sizes,
 * rings, image loads and the drag preview. A node gets as big as its name,
 * so the renderer measures each name after drawing it.
 */
export default class Draw {
  private map: MmpMap;
  private mapRef: HTMLElement;
  private layerSelections: Layers | null = null;
  private editingId: string | null = null;
  private tappedTwice = false;

  /** The measured size of each name, by node id. */
  private readonly textExtents = new Map<string, MapNodeDimensions>();
  /** The selection ring color, by node id. */
  private readonly rings = new Map<string, string>();
  private readonly images = new Map<string, ImageLoad>();
  /** The DOM element of each drawn node, by node id. */
  private readonly groups = new Map<string, SVGGElement>();
  /** The drawn branch of each node that has a parent, by node id. */
  private readonly branches = new Map<string, DrawnBranch>();
  /**
   * The ids of the nodes whose drawn branch leaves from a node, by the
   * node's id. A change of a node redraws these branches, and the hidden
   * child nodes mark reads whether a node has any.
   */
  private readonly branchesFrom = new Map<string, Set<string>>();
  /**
   * The ids of the drawn nodes whose parent the map data lacks, by the
   * parent's id. Such a node draws as a root until a later change adds the
   * parent, and a draw of the parent then draws these nodes too.
   */
  private readonly orphans = new Map<string, Set<string>>();
  /** The parent id each node in `orphans` waits for, by node id. */
  private readonly missingParents = new Map<string, string>();
  /** Where a drag shows each node it moves, by node id. */
  private readonly preview = new Map<string, MapNodeCoordinates>();
  private readonly resizeObserver: ResizeObserver | null;
  private readonly observed = new WeakSet<Element>();

  /**
   * Get the associated map instance.
   * @param {Map} map
   */
  constructor(map: MmpMap, ref: HTMLElement) {
    this.map = map;
    this.mapRef = ref;
    // A name changes size when its font loads or while the person types.
    this.resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(entries =>
            this.resize(
              entries.map(entry =>
                d3.select<Element, string>(entry.target).datum()
              )
            )
          );
  }

  private get layers(): Layers {
    if (!this.layerSelections) throw new Error('The map is not created yet');
    return this.layerSelections;
  }

  /**
   * Create svg and main css map properties.
   * @returns {DomElements} the created dom elements of the map
   */
  public create(): DomElements {
    const container = d3.select(this.mapRef).style('position', 'relative');

    const svg = container
      .append('svg')
      .style('position', 'absolute')
      .style('width', '100%')
      .style('height', '100%')
      .style('top', 0)
      .style('left', 0);

    svg
      .append('rect')
      .attr('width', '100%')
      .attr('height', '100%')
      .attr('fill', 'var(--color-bg-primary, white)')
      .attr('class', 'map-background')
      .attr('pointer-events', 'all')
      .on('click', () => {
        // Deselect the selected node when click on the map background
        this.map.nodes.deselectNode();
      });

    const g = svg.append('g');
    this.layerSelections = {
      branches: g.append('g').attr('class', 'branches'),
      nodes: g.append('g').attr('class', 'nodes'),
    };

    return { container, svg, g };
  }

  /**
   * Remove every drawn node and draw the map again from one scan of the map
   * data. `drawAll` keeps the measured sizes, image loads and rings of the
   * nodes that stay, and drops those of the nodes the map data lacks.
   */
  public drawAll() {
    const records = this.map.data.nodes();
    const ids = records.map(record => record.id);

    [...this.groups.keys()].forEach(id => this.dropGroup(id));
    [...this.branches.keys()].forEach(id => this.dropBranch(id));
    this.orphans.clear();
    this.missingParents.clear();

    const present = new Set(ids);
    for (const state of [this.textExtents, this.images, this.rings]) {
      for (const id of state.keys()) if (!present.has(id)) state.delete(id);
    }

    this.drawNodes(ids, records);
  }

  /**
   * Draw the nodes with the ids, their branches and the branches of their
   * children. The renderer gives a node without a DOM element one. For a
   * node with a new parent, the renderer also draws the old parent, the new
   * parent and the node's drawn descendants, so the result matches
   * `drawAll`. The renderer skips ids the map data lacks. `records` may hold
   * the records a caller already read.
   * @param {Iterable<string>} ids
   * @param {MapNodeRecord[]} records
   */
  public drawNodes(ids: Iterable<string>, records?: MapNodeRecord[]) {
    const lookup = this.drawPassLookup(records);
    const requested = new Set(ids);
    for (const id of [...requested]) {
      this.orphans.get(id)?.forEach(orphan => requested.add(orphan));
    }
    const present = new Set(
      [...requested].filter(id => lookup(id) !== undefined)
    );
    if (present.size === 0) return;

    for (const id of this.place([...present], lookup)) {
      if (lookup(id) !== undefined) present.add(id);
    }
    const drawn = [...present];
    this.render(drawn, this.branchIdsOf(drawn), lookup);
  }

  /**
   * Draw the node and its drawn descendants, read along the drawn branches
   * instead of a scan of the map data.
   * @param {string} id
   */
  public drawSubtree(id: string) {
    this.drawNodes(this.withDescendants([id]));
  }

  /**
   * Remove the DOM and the render data of the nodes. Returns the ids to draw
   * again: the parents the removed branches left from, whose hidden child
   * nodes mark depends on their children, and nodes left without a parent.
   * @param {string[]} ids
   */
  public removeNodes(ids: string[]): string[] {
    const redraw: string[] = [];

    for (const id of ids) {
      const parent = this.branches.get(id)?.parent;
      if (parent !== undefined) redraw.push(parent);
      redraw.push(...(this.branchesFrom.get(id) ?? []));

      this.dropBranch(id);
      this.dropGroup(id);
      this.waitForParent(id, null);
      this.textExtents.delete(id);
      this.rings.delete(id);
      this.images.delete(id);
      this.preview.delete(id);
    }

    return redraw;
  }

  /**
   * Move the drawn nodes to their positions, along with their branches and
   * those of their children.
   * @param {string[]} ids
   */
  public renderPositions(ids: string[]) {
    const lookup = this.drawPassLookup();
    const present = ids.filter(id => this.groups.has(id));

    this.groupsOf(present).attr('transform', id =>
      translate(this.map.nodes.positionOf(id, lookup))
    );
    this.branchesOf(this.branchIdsOf(present)).attr('d', id =>
      this.branchShape(id, lookup)
    );
  }

  /**
   * The position the drag preview shows the node at, or undefined.
   * @param {string} id
   */
  public previewOf(id: string): MapNodeCoordinates | undefined {
    return this.preview.get(id);
  }

  /**
   * Show the node at `position` until the preview is taken.
   * @param {string} id
   * @param {MapNodeCoordinates} position
   */
  public setPreview(id: string, position: MapNodeCoordinates) {
    this.preview.set(id, { x: position.x, y: position.y });
  }

  /** Return the preview positions and clear the preview. */
  public takePreview(): Map<string, MapNodeCoordinates> {
    const positions = new Map(this.preview);
    this.preview.clear();
    return positions;
  }

  /**
   * Stop watching names for size changes. The map calls this on removal.
   */
  public destroy() {
    this.resizeObserver?.disconnect();
  }

  /**
   * The size of the node: its name plus padding. Before the name is drawn,
   * a canvas element estimates its size.
   * @param {ResolvedNode} node
   */
  public dimensionsOf = (node: ResolvedNode): MapNodeDimensions =>
    withPadding(this.textExtentOf(node));

  /**
   * The node size a name will get, estimated before the node is drawn. The
   * layout uses it to place the nodes of an imported map.
   */
  public estimateExtent = (
    name: string,
    font: MapNodeFont
  ): MapNodeDimensions =>
    measureNodeExtent(name, { ...font, family: this.map.options.fontFamily });

  /**
   * The color of the ring around the node, null for none.
   * @param {string} id
   */
  public ringOf(id: string): string | null {
    return this.rings.get(id) ?? null;
  }

  /**
   * Draw a ring in `color` around the node, or none for null or ''.
   * @param {string} id
   * @param {string | null} color
   */
  public setRing(id: string, color: string | null) {
    if (color) this.rings.set(id, color);
    else this.rings.delete(id);

    this.groupsOf([id])
      .selectChildren<SVGPathElement, string>('path.background')
      .style('stroke', () => color || null);
  }

  /**
   * The ring color of a node: its background color, darkened. Null when the
   * background holds no color.
   * @param {ResolvedNode} node
   */
  public ringColor(node: ResolvedNode): string | null {
    return d3.color(node.colors.background)?.darker(0.5).toString() ?? null;
  }

  /**
   * True while the person edits the name of the node.
   * @param {string} id
   */
  public isEditing(id: string): boolean {
    const name = this.nameOf(id);
    return name !== null && name.ownerDocument.activeElement === name;
  }

  /**
   * Take the focus from the name of the node, which ends its editing.
   * @param {string} id
   */
  public blurName(id: string) {
    this.nameOf(id)?.blur();
  }

  /**
   * Enable and manage all events for the name editing.
   * @param {string} id
   */
  public enableNodeNameEditing(id: string) {
    const node = this.map.nodes.record(id);
    if (!node || this.map.nodes.refusesChange(id)) return;

    const name = this.nameOf(id);
    if (!name) return;

    this.editingId = id;
    name.setAttribute('contenteditable', 'true');
    name.innerHTML = DOMPurify.sanitize(node.name);

    Utils.focusWithCaretAtEnd(name);

    name.style.setProperty('cursor', 'auto');

    name.ondblclick = name.onmousedown = event => {
      event.stopPropagation();
    };

    // Allow only some shortcuts.
    name.onkeydown = event => {
      // Unfocus the node.
      if (event.code === 'Escape') {
        Utils.removeAllRanges();
        name.blur();
      }

      if (event.ctrlKey || event.metaKey) {
        switch (event.code) {
          case 'KeyA':
          case 'KeyC':
          case 'KeyV':
          case 'KeyX':
          case 'KeyZ':
          case 'ArrowLeft':
          case 'ArrowRight':
          case 'ArrowUp':
          case 'ArrowDown':
          case 'Backspace':
          case 'Delete':
            return true;
          default:
            return false;
        }
      }

      switch (event.code) {
        case 'Tab':
          return false;
        default:
          return true;
      }
    };

    // Remove html formatting when paste text on node
    name.onpaste = event => {
      event.preventDefault();

      const text = event.clipboardData?.getData('text/plain');
      if (text === undefined) return;

      document.execCommand('insertText', false, text);
    };

    name.onblur = () => {
      this.editingId = null;

      name.ondblclick =
        name.onmousedown =
        name.onblur =
        name.onkeydown =
        name.onpaste =
          null;

      name.setAttribute('contenteditable', 'false');
      name.style.setProperty('cursor', 'pointer');

      // The blur commits to the node it edited, whatever node the selection
      // moves to, and reads the name the map data holds now.
      const current = this.map.nodes.record(id);
      if (current && name.innerHTML !== current.name) {
        this.map.nodes.updateNode(
          'name',
          DOMPurify.sanitize(name.innerHTML),
          id
        );
      }
      // Draw the stored name back, so the DOM drops the typed text when a
      // peer protected the branch during the edit and updateNode refused it.
      this.drawNodes([id]);
    };
  }

  /**
   * One draw pass: a lookup that reads each record from the map data at
   * most once, or from `records` when the caller already read them.
   */
  private drawPassLookup(records?: MapNodeRecord[]): RecordLookup {
    if (records) {
      const resolved = new Map(
        records.map(record => [record.id, resolveNode(record)])
      );
      return id => resolved.get(id);
    }

    const read = new Map<string, ResolvedNode | null>();
    return id => {
      let known = read.get(id);
      if (known === undefined) {
        const record = this.map.data.node(id);
        known = record ? resolveNode(record) : null;
        read.set(id, known);
      }
      return known ?? undefined;
    };
  }

  /**
   * Give each node a DOM element when it has none, and its branch the
   * parent the record names now. Returns the ids of the nodes a new parent
   * affects:
   *
   * - the parent a branch leaves and the parent it joins, whose hidden child
   *   nodes mark depends on their children
   * - each node that had a DOM element before its parent changed, with its
   *   drawn descendants, whose visibility and branch width depend on their
   *   ancestors
   */
  private place(ids: string[], lookup: RecordLookup): string[] {
    const entering = ids.filter(id => !this.groups.has(id));
    this.enterNodes(
      this.layers.nodes
        .selectAll<SVGGElement, string>(() => [])
        .data(entering)
        .enter()
    ).each((id, i, groups) => this.groups.set(id, groups[i]));

    const entered = new Set(entering);
    const branching: string[] = [];
    const parents: string[] = [];
    const moved: string[] = [];
    for (const id of ids) {
      const parent = this.map.nodes.parentOf(id, lookup);
      const named = lookup(id)?.parent || null;
      this.waitForParent(id, parent === null ? named : null);
      const drawn = this.branches.get(id);
      if ((drawn?.parent ?? null) === parent) continue;

      if (drawn) {
        this.dropBranch(id);
        parents.push(drawn.parent);
      }
      if (parent !== null) {
        branching.push(id);
        parents.push(parent);
      }
      if (!entered.has(id)) moved.push(id);
    }

    this.layers.branches
      .selectAll<SVGPathElement, string>(() => [])
      .data(branching)
      .enter()
      .append<SVGPathElement>('path')
      .attr('class', 'branch')
      .each((id, i, paths) => {
        const parent = this.map.nodes.parentOf(id, lookup);
        if (parent === null) return;

        this.branches.set(id, { path: paths[i], parent });
        const from = this.branchesFrom.get(parent) ?? new Set<string>();
        from.add(id);
        this.branchesFrom.set(parent, from);
      });

    return [...parents, ...this.withDescendants(moved)];
  }

  /**
   * The ids of the nodes and of their drawn descendants, read along the
   * drawn branches. On a parent cycle, the walk stops at the node that
   * closes it.
   */
  private withDescendants(ids: string[]): string[] {
    const found = new Set(ids);
    const pending = [...ids];
    for (let id = pending.pop(); id !== undefined; id = pending.pop()) {
      for (const child of this.branchesFrom.get(id) ?? []) {
        if (found.has(child)) continue;
        found.add(child);
        pending.push(child);
      }
    }
    return [...found];
  }

  /**
   * Draw the given nodes and branches. The renderer measures all names at
   * once between drawing and sizing, so the browser lays out the page once
   * instead of once per node.
   */
  private render(ids: string[], branchIds: string[], lookup: RecordLookup) {
    const context = this.markContext(lookup);
    const groups = this.groupsOf(ids);
    const branches = this.branchesOf(branchIds);
    const visibilityOf = (id: string) =>
      this.map.nodes.isHidden(id, lookup) ? 'hidden' : 'visible';

    groups
      .attr('transform', id => translate(this.map.nodes.positionOf(id, lookup)))
      .style('visibility', visibilityOf);
    NODE_MARKS.forEach(mark => mark.draw(groups, context));
    this.observe(groups);
    branches
      .style('fill', id => context.recordOf(id).colors.branch)
      .style('stroke', id => context.recordOf(id).colors.branch)
      .style('visibility', visibilityOf);

    this.measure(groups);

    this.finish(groups, branches, context, lookup);
  }

  /**
   * Resize the nodes whose names changed size.
   * @param {string[]} ids
   */
  private resize(ids: string[]) {
    const lookup = this.drawPassLookup();
    const changed = this.measure(
      this.groupsOf(ids.filter(id => lookup(id) !== undefined))
    );
    if (changed.length === 0) return;

    this.finish(
      this.groupsOf(changed),
      this.branchesOf(this.branchIdsOf(changed)),
      this.markContext(lookup),
      lookup
    );
  }

  /**
   * Read and store the size of each drawn name.
   * @returns {string[]} the ids of the nodes whose size changed
   */
  private measure(groups: NodeGroups): string[] {
    const changed: string[] = [];

    nameElements(groups).each((id, i, names) => {
      const width = names[i].offsetWidth,
        height = names[i].offsetHeight;
      // The browser reports 0 for a name it has not laid out yet, such as
      // one in a hidden container. Keep the canvas estimate then.
      if (width === 0 && height === 0) return;

      const extent = {
        width: Math.max(width, MIN_TEXT_EXTENT),
        height: Math.max(height, MIN_TEXT_EXTENT),
      };
      const known = this.textExtents.get(id);
      if (known?.width === extent.width && known.height === extent.height) {
        return;
      }
      this.textExtents.set(id, extent);
      changed.push(id);
    });

    return changed;
  }

  /** Draw everything that depends on the size of the nodes. */
  private finish(
    groups: NodeGroups,
    branches: BranchPaths,
    context: MarkContext,
    lookup: RecordLookup
  ) {
    NODE_MARKS.forEach(mark => mark.finish(groups, context));
    branches.attr('d', id => this.branchShape(id, lookup));
  }

  /**
   * True when the view state hides the child nodes of the node and at least
   * one branch leaves from it. Reads the drawn branches instead of scanning
   * the map data, so a template may call it on every change detection.
   * @param {string} id
   */
  public hidesDrawnChildren(id: string): boolean {
    return (
      this.map.viewState.hidesChildren(id) &&
      (this.branchesFrom.get(id)?.size ?? 0) > 0
    );
  }

  private markContext(lookup: RecordLookup): MarkContext {
    const recordOf = (id: string) => lookup(id) ?? resolveNode({ id });

    return {
      recordOf,
      textExtentOf: id => this.textExtentOf(recordOf(id)),
      dimensionsOf: id => this.dimensionsOf(recordOf(id)),
      ringOf: id => this.ringOf(id),
      imageOf: id => this.imageOf(recordOf(id)),
      isEditing: id => this.editingId === id,
      hidesChildren: id => this.hidesDrawnChildren(id),
      fontFamily: this.map.options.fontFamily,
      showLinktext: this.map.options.showLinktext,
    };
  }

  private textExtentOf(node: ResolvedNode): MapNodeDimensions {
    return (
      this.textExtents.get(node.id) ??
      measureTextExtent(node.name, {
        ...node.font,
        family: this.map.options.fontFamily,
      })
    );
  }

  /**
   * The node's image once it has loaded, else null. A new image starts
   * loading here, and the node is redrawn when the load ends.
   * @param {ResolvedNode} node
   */
  private imageOf(node: ResolvedNode): LoadedImage | null {
    const id = node.id;
    const src = node.image.src;
    const known = this.images.get(id);
    if (known?.src === src) {
      return known.ratio === null
        ? null
        : { url: known.url, ratio: known.ratio };
    }

    this.images.delete(id);
    const url = this.imageUrlOf(src);
    if (url === null) return null;

    const load: ImageLoad = { src, url, ratio: null };
    this.images.set(id, load);

    const image = new Image();
    image.src = url;
    const settle = (ratio: number | null) => {
      // A newer image replaced this one while it loaded.
      if (this.images.get(id) !== load) return;
      // A failed image stays hidden and keeps its value: clearing it would
      // erase the image in the map data for every client on a network error.
      load.ratio = ratio;
      const lookup = this.drawPassLookup();
      if (lookup(id)) this.render([id], [], lookup);
    };
    image.onload = () => settle(image.width / image.height);
    image.onerror = () => settle(null);

    return null;
  }

  /**
   * Returns the URL an image value loads from: the resolved URL of a
   * reference, a base64 raster data URL as is, or null for any other value.
   */
  private imageUrlOf(src: string): string | null {
    if (isImageReference(src)) {
      return this.map.options.resolveImageUrl?.(src) ?? null;
    }
    return isImageDataUrl(src) ? src : null;
  }

  /**
   * The shape of the branch from the node's parent to the node, null for a
   * node without a parent.
   * @param {string} id
   * @param {RecordLookup} lookup
   */
  private branchShape(id: string, lookup: RecordLookup): string | null {
    const nodes = this.map.nodes;
    const parentId = nodes.parentOf(id, lookup);
    const record = lookup(id);
    if (parentId === null || !record) return null;

    const parent = nodes.positionOf(parentId, lookup),
      node = nodes.positionOf(id, lookup),
      { width: nodeWidth, height: nodeHeight } = this.dimensionsOf(record),
      path = d3.path(),
      level = nodes.level(id, lookup),
      width = 22 - (level < 6 ? level : 6) * 3,
      mx = (parent.x + node.x) / 2,
      ory = parent.y < node.y + nodeHeight / 2 ? -1 : 1,
      orx = parent.x > node.x ? -1 : 1,
      inv = orx * ory;

    path.moveTo(parent.x, parent.y - width * 0.8);
    path.bezierCurveTo(
      mx - width * inv,
      parent.y - width / 2,
      parent.x - (width / 2) * inv,
      node.y + nodeHeight / 2 - width / 3,
      node.x - (nodeWidth / 3) * orx,
      node.y + nodeHeight / 2 + 3
    );
    path.bezierCurveTo(
      parent.x + (width / 2) * inv,
      node.y + nodeHeight / 2 + width / 3,
      mx + width * inv,
      parent.y + width / 2,
      parent.x,
      parent.y + width * 0.8
    );
    path.closePath();

    return path.toString();
  }

  /** The drawn nodes with the ids. */
  private groupsOf(ids: string[]): NodeGroups {
    const elements = ids.flatMap(id => this.groups.get(id) ?? []);
    return d3.selectAll<SVGGElement, string>(elements);
  }

  /** The drawn branches to the nodes with the ids. */
  private branchesOf(ids: string[]): BranchPaths {
    const elements = ids.flatMap(id => this.branches.get(id)?.path ?? []);
    return d3.selectAll<SVGPathElement, string>(elements);
  }

  /** The ids of the nodes, followed by those of their drawn children. */
  private branchIdsOf(ids: string[]): string[] {
    const branchIds = new Set(ids);
    for (const id of ids) {
      this.branchesFrom.get(id)?.forEach(child => branchIds.add(child));
    }
    return [...branchIds];
  }

  private nameOf(id: string): HTMLDivElement | null {
    return nameElements(this.groupsOf([id])).node();
  }

  private enterNodes(
    enter: d3.Selection<d3.EnterElement, string, SVGGElement, unknown>
  ): NodeGroups {
    const groups = enter
      .append('g')
      .attr('class', 'node')
      .style('cursor', 'pointer')
      .style('touch-action', 'none')
      .on('dblclick', (event: MouseEvent, id: string) => {
        if (!this.map.options.edit) return;

        event.stopPropagation();
        this.enableNodeNameEditing(id);
      })
      .on(
        'touchstart',
        (event: TouchEvent, id: string) => {
          if (!this.map.options.edit) return false;
          // A single tap moves the node, so the handler cancels the native
          // touch behavior unless the person taps a link or edits a name.
          if (!this.isLinkTarget(event) && this.editingId === null) {
            event.preventDefault();
          }

          // The first tap starts a move. A second tap within 300 ms edits
          // the name.
          if (!this.tappedTwice) {
            this.tappedTwice = true;

            setTimeout(() => {
              this.tappedTwice = false;
            }, 300);

            return false;
          }

          this.enableNodeNameEditing(id);
        },
        { passive: false }
      );

    if (this.map.options.drag === true) {
      groups.call(this.map.drag.getDragBehavior());
    } else {
      groups.on('mousedown', (_event: MouseEvent, id: string) => {
        this.map.nodes.selectNode(id);
      });
    }

    return groups;
  }

  /** Start observing the name of each node drawn for the first time. */
  private observe(groups: NodeGroups) {
    if (!this.resizeObserver) return;

    nameElements(groups).each((_id, i, names) => {
      if (this.observed.has(names[i])) return;
      this.observed.add(names[i]);
      this.resizeObserver?.observe(names[i]);
    });
  }

  /** Remove the DOM element of the node. */
  private dropGroup(id: string) {
    const group = this.groups.get(id);
    if (!group) return;

    nameElements(this.groupsOf([id])).each((_id, i, names) => {
      this.resizeObserver?.unobserve(names[i]);
      // A blur fired by the removal would commit the typed name over the
      // change that removed the node.
      names[i].onblur = null;
    });
    // Removing a focused name fires no blur in Firefox and WebKit, so the
    // edit ends here.
    if (id === this.editingId) this.editingId = null;
    group.remove();
    this.groups.delete(id);
  }

  /**
   * Record that the node waits for the parent with the id `parent` to appear
   * in the map data, or for none when `parent` is null.
   */
  private waitForParent(id: string, parent: string | null) {
    const waiting = this.missingParents.get(id);
    if (waiting === parent) return;

    if (waiting !== undefined) {
      const orphans = this.orphans.get(waiting);
      orphans?.delete(id);
      if (orphans?.size === 0) this.orphans.delete(waiting);
      this.missingParents.delete(id);
    }
    if (parent === null) return;

    this.missingParents.set(id, parent);
    const orphans = this.orphans.get(parent) ?? new Set<string>();
    orphans.add(id);
    this.orphans.set(parent, orphans);
  }

  /** Remove the drawn branch to the node. */
  private dropBranch(id: string) {
    const branch = this.branches.get(id);
    if (!branch) return;

    branch.path.remove();
    this.branches.delete(id);
    const from = this.branchesFrom.get(branch.parent);
    from?.delete(id);
    if (from?.size === 0) this.branchesFrom.delete(branch.parent);
  }

  /**
   * Checks if the target of the event is the link below the node
   * @param {TouchEvent} event
   * @returns {boolean}
   */
  private isLinkTarget(event: TouchEvent): boolean {
    return (event.target as Element).classList[0] === 'link-text';
  }
}

function translate(position: MapNodeCoordinates): string {
  return 'translate(' + position.x + ',' + position.y + ')';
}
