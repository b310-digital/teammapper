import * as d3 from 'd3';
import DOMPurify from 'dompurify';
import {
  isImageDataUrl,
  isImageReference,
  type MapNodeDimensions,
  type MapNodeFont,
  type NodeProperty,
} from '@teammapper/shared';
import type { NodeView } from './node-view.js';
import MmpMap, { DomElements } from '../map.js';
import Utils from '../../utils/utils.js';
import Node from '../models/node.js';
import {
  MIN_TEXT_EXTENT,
  measureNodeExtent,
  measureTextExtent,
  withPadding,
} from './node-geometry.js';
import {
  NODE_PARTS,
  nameElements,
  type LoadedImage,
  type NodeGroups,
  type PartContext,
} from './node-parts.js';

type BranchPaths = d3.Selection<SVGPathElement, Node, d3.BaseType, unknown>;

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

/**
 * Draw the map and update it. Nodes and branches are joined to the node
 * store with d3, each node from the parts in `NODE_PARTS`. Every render
 * writes, then measures the names, then writes what depends on their size.
 * The sizes stay with the renderer: drawing never writes to the model.
 */
export default class Draw implements NodeView {
  private map: MmpMap;
  private mapRef: HTMLElement;
  private layerSelections: Layers | null = null;
  private editingId: string | null = null;
  private tappedTwice = false;

  /** The measured size of each drawn name. */
  private readonly textExtents = new Map<string, MapNodeDimensions>();
  private readonly rings = new Map<string, string>();
  private readonly images = new Map<string, ImageLoad>();
  private readonly resizeObserver: ResizeObserver | null;
  private readonly observed = new WeakSet<Element>();

  /**
   * Get the associated map instance.
   * @param {Map} map
   */
  constructor(map: MmpMap, ref: HTMLElement) {
    this.map = map;
    this.mapRef = ref;
    // A name changes size when its font loads and while the person types.
    this.resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(entries =>
            this.resize(
              entries.map(entry =>
                d3.select<Element, Node>(entry.target).datum()
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
   * Join the nodes and branches to the node store and draw all of them.
   * Hidden nodes stay in the DOM with visibility hidden, so their updates
   * still take effect.
   */
  public update() {
    const nodes = this.map.nodes.getNodes();

    const groups = this.nodeGroups()
      .data(nodes, node => node.id)
      .join(
        enter => this.enterNodes(enter),
        update => update,
        exit => this.exitNodes(exit)
      );
    const branches = this.branchPaths()
      .data(
        nodes.filter(node => node.parent !== null),
        node => node.id
      )
      .join(enter =>
        enter.append<SVGPathElement>('path').attr('class', 'branch')
      );

    const ids = new Set(nodes.map(node => node.id));
    for (const state of [this.textExtents, this.rings, this.images]) {
      for (const id of state.keys()) if (!ids.has(id)) state.delete(id);
    }

    this.render(groups, branches);
  }

  /**
   * Draw the property of the node as its model holds it.
   * @param {Node} node
   * @param {NodeProperty} property
   */
  public renderNodeProperty(node: Node, property: NodeProperty) {
    // The caller hides and shows nodes with a full update.
    if (property === 'hidden') return;

    // The selection ring darkens along with the background.
    if (property === 'backgroundColor' && this.rings.has(node.id)) {
      this.setRing(node, this.ringColor(node));
    }
    this.render(this.nodeGroupsOf([node]), this.branchPathsOf([node]));
  }

  /**
   * Move the drawn nodes to their coordinates, along with their branches and
   * those of their children.
   * @param {Node[]} nodes
   */
  public renderPositions(nodes: Node[]) {
    this.nodeGroupsOf(nodes).attr('transform', translate);
    this.branchPathsOf(nodes).attr('d', node => this.branchShape(node));
  }

  /**
   * Remove all nodes and branches of the map.
   */
  public clear() {
    this.nodeGroups().call(groups => this.exitNodes(groups));
    this.branchPaths().remove();
    this.rings.clear();
  }

  /**
   * The size of the node's box. A node not measured yet gets the size its
   * name has on a canvas.
   * @param {Node} node
   */
  public dimensionsOf = (node: Node): MapNodeDimensions =>
    withPadding(this.textExtentOf(node));

  /**
   * The size a node box gets for a name in a font, before it is drawn.
   */
  public estimateExtent = (
    name: string,
    font: MapNodeFont
  ): MapNodeDimensions =>
    measureNodeExtent(name, { ...font, family: this.map.options.fontFamily });

  /**
   * The color of the ring around the node, null for none.
   * @param {Node} node
   */
  public ringOf(node: Node): string | null {
    return this.rings.get(node.id) ?? null;
  }

  /**
   * Draw a ring in `color` around the node, or none for null or ''.
   * @param {Node} node
   * @param {string | null} color
   */
  public setRing(node: Node, color: string | null) {
    if (color) this.rings.set(node.id, color);
    else this.rings.delete(node.id);

    this.nodeGroupsOf([node])
      .selectChildren<SVGPathElement, Node>('path.background')
      .style('stroke', () => color || null);
  }

  /**
   * The ring color of a node: its background color, darkened. Null when the
   * background holds no color.
   * @param {Node} node
   */
  public ringColor(node: Node): string | null {
    return d3.color(node.colors.background)?.darker(0.5).toString() ?? null;
  }

  /**
   * True while the person edits the name of the node.
   * @param {Node} node
   */
  public isEditing(node: Node): boolean {
    const name = this.nameOf(node);
    return name !== null && name.ownerDocument.activeElement === name;
  }

  /**
   * Take the focus from the name of the node, which ends its editing.
   * @param {Node} node
   */
  public blurName(node: Node) {
    this.nameOf(node)?.blur();
  }

  /**
   * Enable and manage all events for the name editing.
   * @param {Node} node
   */
  public enableNodeNameEditing(node: Node) {
    if (this.map.nodes.refusesLocalChange(node)) return;

    const name = this.nameOf(node);
    if (!name) return;

    this.editingId = node.id;
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

      if (name.innerHTML !== node.name) {
        this.map.nodes.updateNode('name', DOMPurify.sanitize(name.innerHTML));
      }
      // Draw node.name back, so the DOM drops the typed text when a peer
      // protected the branch during the edit and updateNode refused it.
      this.render(this.nodeGroupsOf([node]), this.branchPathsOf([node]));
    };
  }

  /**
   * Draw, measure and finish the given node groups and branches. Each step
   * passes over all of them, so no size is read between two writes.
   */
  private render(groups: NodeGroups, branches: BranchPaths) {
    const context = this.partContext();

    groups
      .attr('transform', translate)
      .style('visibility', node => (node.hidden ? 'hidden' : 'visible'));
    NODE_PARTS.forEach(part => part.draw(groups, context));
    this.observe(groups);
    branches
      .style('fill', node => node.colors.branch)
      .style('stroke', node => node.colors.branch)
      .style('visibility', node => (node.hidden ? 'hidden' : 'visible'));

    this.measure(groups);

    this.finish(groups, branches, context);
  }

  /**
   * Measure the names of nodes whose size changed after their last render
   * and finish those nodes.
   * @param {Node[]} nodes
   */
  private resize(nodes: Node[]) {
    const changed = this.measure(this.nodeGroupsOf(nodes));
    if (changed.length === 0) return;

    this.finish(
      this.nodeGroupsOf(changed),
      this.branchPathsOf(changed),
      this.partContext()
    );
  }

  /**
   * Read the size of every name in the groups in one pass.
   * @returns {Node[]} the nodes whose size changed
   */
  private measure(groups: NodeGroups): Node[] {
    const changed: Node[] = [];

    nameElements(groups).each((node, i, names) => {
      const width = names[i].offsetWidth,
        height = names[i].offsetHeight;
      // A name the browser has not laid out keeps its estimate.
      if (width === 0 && height === 0) return;

      const extent = {
        width: Math.max(width, MIN_TEXT_EXTENT),
        height: Math.max(height, MIN_TEXT_EXTENT),
      };
      const known = this.textExtents.get(node.id);
      if (known?.width === extent.width && known.height === extent.height) {
        return;
      }
      this.textExtents.set(node.id, extent);
      changed.push(node);
    });

    return changed;
  }

  /** Write everything that depends on the size of the nodes. */
  private finish(
    groups: NodeGroups,
    branches: BranchPaths,
    context: PartContext
  ) {
    NODE_PARTS.forEach(part => part.finish(groups, context));
    branches.attr('d', node => this.branchShape(node));
  }

  private partContext(): PartContext {
    return {
      textExtentOf: node => this.textExtentOf(node),
      dimensionsOf: this.dimensionsOf,
      ringOf: node => this.ringOf(node),
      imageOf: node => this.imageOf(node),
      isEditing: node => this.editingId === node.id,
      fontFamily: this.map.options.fontFamily,
      showLinktext: this.map.options.showLinktext,
    };
  }

  private textExtentOf(node: Node): MapNodeDimensions {
    return (
      this.textExtents.get(node.id) ??
      measureTextExtent(node.name, {
        ...node.font,
        family: this.map.options.fontFamily,
      })
    );
  }

  /**
   * The loaded image of the node. Starts loading an image the node shows
   * for the first time, and renders the node again once the load ends.
   * @param {Node} node
   */
  private imageOf(node: Node): LoadedImage | null {
    const src = node.image.src;
    const known = this.images.get(node.id);
    if (known?.src === src) {
      return known.ratio === null
        ? null
        : { url: known.url, ratio: known.ratio };
    }

    this.images.delete(node.id);
    const url = this.imageUrlOf(src);
    if (url === null) return null;

    const load: ImageLoad = { src, url, ratio: null };
    this.images.set(node.id, load);

    const image = new Image();
    image.src = url;
    const settle = (ratio: number | null) => {
      // A newer image replaced this one while it loaded.
      if (this.images.get(node.id) !== load) return;
      // A failed image stays hidden and keeps its value: clearing it would
      // erase the image in the Y.Doc for every client on a network error.
      load.ratio = ratio;
      this.render(this.nodeGroupsOf([node]), this.branchPathsOf([]));
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
   * @param {Node} node
   */
  private branchShape(node: Node): string | null {
    if (node.parent === null) return null;

    const parent = node.parent,
      { width: nodeWidth, height: nodeHeight } = this.dimensionsOf(node),
      path = d3.path(),
      level = node.getLevel(),
      width = 22 - (level < 6 ? level : 6) * 3,
      mx = (parent.coordinates.x + node.coordinates.x) / 2,
      ory = parent.coordinates.y < node.coordinates.y + nodeHeight / 2 ? -1 : 1,
      orx = parent.coordinates.x > node.coordinates.x ? -1 : 1,
      inv = orx * ory;

    path.moveTo(parent.coordinates.x, parent.coordinates.y - width * 0.8);
    path.bezierCurveTo(
      mx - width * inv,
      parent.coordinates.y - width / 2,
      parent.coordinates.x - (width / 2) * inv,
      node.coordinates.y + nodeHeight / 2 - width / 3,
      node.coordinates.x - (nodeWidth / 3) * orx,
      node.coordinates.y + nodeHeight / 2 + 3
    );
    path.bezierCurveTo(
      parent.coordinates.x + (width / 2) * inv,
      node.coordinates.y + nodeHeight / 2 + width / 3,
      mx + width * inv,
      parent.coordinates.y + width / 2,
      parent.coordinates.x,
      parent.coordinates.y + width * 0.8
    );
    path.closePath();

    return path.toString();
  }

  private nodeGroups(): NodeGroups {
    return this.layers.nodes.selectChildren<SVGGElement, Node>('g.node');
  }

  private branchPaths(): BranchPaths {
    return this.layers.branches.selectChildren<SVGPathElement, Node>(
      'path.branch'
    );
  }

  private nodeGroupsOf(nodes: Node[]): NodeGroups {
    const ids = new Set(nodes.map(node => node.id));
    return this.nodeGroups().filter(node => ids.has(node.id));
  }

  /** The branches of the nodes and of their children. */
  private branchPathsOf(nodes: Node[]): BranchPaths {
    const ids = new Set(nodes.map(node => node.id));
    return this.branchPaths().filter(
      node =>
        ids.has(node.id) || (node.parent !== null && ids.has(node.parent.id))
    );
  }

  private nameOf(node: Node): HTMLDivElement | null {
    return nameElements(this.nodeGroupsOf([node])).node();
  }

  private enterNodes(
    enter: d3.Selection<d3.EnterElement, Node, d3.BaseType, unknown>
  ): NodeGroups {
    const groups = enter
      .append('g')
      .attr('class', 'node')
      .style('cursor', 'pointer')
      .style('touch-action', 'none')
      .on('dblclick', (event: MouseEvent, node: Node) => {
        if (!this.map.options.edit) return;

        event.stopPropagation();
        this.enableNodeNameEditing(node);
      })
      .on(
        'touchstart',
        (event: TouchEvent, node: Node) => {
          if (!this.map.options.edit) return false;
          // When not clicking a link and not in edit mode, disable all mobile native touch events
          // A single tap is supposed to move the node in this application
          if (!this.isLinkTarget(event) && this.editingId === null) {
            event.preventDefault();
          }

          // a single tap should enter moving node mode - not a selection
          if (!this.tappedTwice) {
            this.tappedTwice = true;

            setTimeout(() => {
              this.tappedTwice = false;
            }, 300);

            return false;
          }

          this.enableNodeNameEditing(node);
        },
        { passive: false }
      );

    if (this.map.options.drag === true) {
      groups.call(this.map.drag.getDragBehavior());
    } else {
      groups.on('mousedown', (_event: MouseEvent, node: Node) => {
        this.map.nodes.selectNode(node.id);
      });
    }

    return groups;
  }

  /** Observe the names of the groups that are drawn for the first time. */
  private observe(groups: NodeGroups) {
    if (!this.resizeObserver) return;

    nameElements(groups).each((_node, i, names) => {
      if (this.observed.has(names[i])) return;
      this.observed.add(names[i]);
      this.resizeObserver?.observe(names[i]);
    });
  }

  private exitNodes(exit: NodeGroups) {
    nameElements(exit).each((_node, i, names) =>
      this.resizeObserver?.unobserve(names[i])
    );
    exit.remove();
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

function translate(node: Node): string {
  return 'translate(' + node.coordinates.x + ',' + node.coordinates.y + ')';
}
