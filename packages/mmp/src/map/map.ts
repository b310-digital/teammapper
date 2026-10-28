import * as d3 from 'd3';
import Events, { MmpEventCallback, MmpEventType } from './handlers/events.js';
import Zoom from './handlers/zoom.js';
import Draw from './handlers/draw.js';
import Options, { OptionParameters } from './options.js';
import MapLoader from './handlers/map-loader.js';
import Drag from './handlers/drag.js';
import Nodes from './handlers/nodes.js';
import Export from './handlers/export.js';
import CopyPaste from './handlers/copy-paste.js';
import ViewState from './handlers/view-state.js';
import Arrows from './handlers/arrows.js';
import type { MapData } from './data/map-data.js';
import type {
  ArrowRefusal,
  ExportNodeProperties,
  MapArrow,
  MapSnapshot,
  NodeProperty,
  NodePropertyValues,
  UserNodeProperties,
} from '@teammapper/shared';

/**
 * Initialize all handlers and return a mmp object.
 */
export default class MmpMap {
  public dom: DomElements;
  /** The nodes of the map. mmp reads and writes them here and keeps none. */
  public readonly data: MapData;

  public options: Options;
  public loader: MapLoader;
  public events: Events;
  public zoom: Zoom;
  public draw: Draw;
  public drag: Drag;
  public nodes: Nodes;
  public export: Export;
  public copyPaste: CopyPaste;
  public viewState: ViewState;
  public arrows: Arrows;

  public readonly instance: MmpInstance;

  private readonly unsubscribeData: () => void;
  private destroyed = false;

  /**
   * Create all handler instances, set some map behaviors, draw the nodes the
   * map data holds and return a mmp instance. The map selects the main root
   * and fires `nodeSelect`, and emits no `mapChange` for this first draw.
   * @param {HTMLElement} ref
   * @param {OptionParameters} options
   * @param {MapData} data
   */
  constructor(
    ref: HTMLElement,
    options: OptionParameters | undefined,
    data: MapData
  ) {
    this.data = data;

    this.events = new Events();
    this.options = new Options(options, this);
    this.zoom = new Zoom(this);
    this.viewState = new ViewState();
    this.loader = new MapLoader(this);
    this.drag = new Drag(this);
    this.draw = new Draw(this, ref);
    this.nodes = new Nodes(this);
    this.arrows = new Arrows(this);
    this.export = new Export(this);
    this.copyPaste = new CopyPaste(this);

    this.dom = this.draw.create();

    this.centerOnWindowResize(this.options.centerOnResize === true);

    if (this.options.zoom === true) {
      this.dom.svg.call(this.zoom.getZoomBehavior());
    }

    this.instance = this.createMmpInstance();

    this.unsubscribeData = data.subscribe(this.nodes.onChange);
    this.nodes.drawReplaced();
  }

  /**
   * Center the map on every window resize, or stop doing so. The map adds
   * and removes its own function, so it removes no listener another map
   * registered.
   * @param {boolean} flag
   */
  public centerOnWindowResize(flag: boolean) {
    if (flag) window.addEventListener('resize', this.onResize);
    else window.removeEventListener('resize', this.onResize);
  }

  /**
   * Remove the map for good: its svg, every subscription and the resize
   * listener on the window. A second call does nothing.
   */
  private destroy = () => {
    if (this.destroyed) return;
    this.destroyed = true;

    this.centerOnWindowResize(false);
    this.unsubscribeData();
    this.events.unsubscribeAll();
    this.draw.destroy();
    this.dom.svg.remove();
  };

  /** Center the map when the window resizes. */
  private onResize = () => {
    this.zoom.center();
  };

  /**
   * Switch editing and dragging on or off together. The handlers read both
   * flags when an event arrives, so the map draws nothing anew. A name edit
   * that runs already holds its own handlers, so turning editing off ends it,
   * together with arrow mode and the arrow selection.
   */
  private setEditable = (editable: boolean) => {
    this.options.edit = editable;
    this.options.drag = editable;
    if (editable) return;
    this.draw.cancelNameEditing();
    this.arrows.onReadOnly();
  };

  /**
   * Return a mmp instance with all mmp library functions.
   * @return {MmpInstance} mmpInstance
   */
  private createMmpInstance(): MmpInstance {
    return {
      addArrow: this.arrows.addArrow,
      addNode: this.nodes.addNode,
      addTree: this.nodes.addTree,
      center: this.zoom.center,
      copyNode: this.copyPaste.copy,
      cutNode: this.copyPaste.cut,
      applyCoordinatesToMapSnapshot: this.nodes.applyCoordinatesToMapSnapshot,
      deselectArrow: this.arrows.deselectArrow,
      distributeNodes: this.nodes.distributeNodes,
      getArrows: this.arrows.getArrows,
      getSelectedArrow: this.arrows.getSelectedArrow,
      getSelectedNode: this.nodes.getSelectedNode,
      isArrowMode: this.arrows.isArrowMode,
      editNode: this.nodes.editNode,
      toggleBranchVisibility: this.nodes.toggleBranchVisibility,
      childNodesHidden: this.nodes.childNodesHidden,
      existNode: this.nodes.existNode,
      exportAsImage: this.export.asImage,
      exportAsJSON: this.export.asJSON,
      exportRootProperties: () => this.nodes.mainRoot(),
      highlightNode: this.nodes.highlightNodeWithColor,
      new: this.loader.load,
      nodeChildren: this.nodes.nodeChildren,
      on: this.events.on,
      pasteNode: this.copyPaste.paste,
      pasteTree: this.copyPaste.pasteTree,
      protectBranch: this.nodes.protectBranch,
      protectingNode: this.nodes.protectingNode,
      releaseBranch: this.nodes.releaseBranch,
      destroy: this.destroy,
      removeArrow: this.arrows.removeArrow,
      removeNode: this.nodes.removeNode,
      selectArrow: this.arrows.selectArrow,
      selectNode: this.nodes.selectNode,
      setEditable: this.setEditable,
      startArrowMode: this.arrows.startArrowMode,
      stopArrowMode: this.arrows.stopArrowMode,
      updateNode: this.nodes.updateNode,
      updateOption: this.options.update,
      zoomIn: this.zoom.zoomIn,
      zoomOut: this.zoom.zoomOut,
    };
  }
}

/**
 * The functions the mmp library offers. Every node it returns is a copy the
 * caller may change; the map data keeps its own.
 */
export interface MmpInstance {
  /**
   * Add an arrow from `source`, or from the selected node, to `target`.
   * Returns why the endpoint rules refuse it, or null once it is added.
   */
  addArrow: (target: string, source?: string) => ArrowRefusal | null;
  addNode: (
    userProperties?: UserNodeProperties,
    parentId?: string | null
  ) => ExportNodeProperties | null;
  addTree: () => ExportNodeProperties | null;
  center: (type?: 'zoom' | 'position', duration?: number) => void;
  copyNode: (id?: string) => void;
  cutNode: (id?: string) => boolean;
  applyCoordinatesToMapSnapshot: (mapSnapshot: MapSnapshot) => MapSnapshot;
  deselectArrow: () => void;
  distributeNodes: () => void;
  getArrows: () => MapArrow[];
  getSelectedArrow: () => MapArrow | null;
  getSelectedNode: () => ExportNodeProperties | null;
  isArrowMode: () => boolean;
  editNode: () => void;
  toggleBranchVisibility: () => void;
  childNodesHidden: (id?: string) => boolean;
  existNode: (id?: string) => boolean;
  exportAsImage: (callback: (url: string) => void, type?: string) => void;
  exportAsJSON: () => MapSnapshot;
  exportRootProperties: () => ExportNodeProperties | null;
  highlightNode: (id: string, color: string) => void;
  new: (nodes?: MapSnapshot, arrows?: unknown[]) => void;
  nodeChildren: (id?: string) => ExportNodeProperties[];
  on: <K extends MmpEventType>(
    event: K,
    callback: MmpEventCallback<K>
  ) => () => void;
  pasteNode: (id?: string) => void;
  pasteTree: () => void;
  protectBranch: (id?: string) => void;
  protectingNode: (id?: string) => string | null;
  releaseBranch: (id?: string) => void;
  destroy: () => void;
  /** Remove the arrow with `key`, or the selected arrow. */
  removeArrow: (key?: string) => void;
  removeNode: (id?: string) => void;
  /** Select the arrow with `key` and leave no node selected. */
  selectArrow: (key: string) => void;
  selectNode: (id?: string) => ExportNodeProperties | null;
  setEditable: (editable: boolean) => void;
  /**
   * Start arrow mode from the selected node. Returns false, and starts
   * nothing, without a selected node or on a read-only map.
   */
  startArrowMode: () => boolean;
  stopArrowMode: () => void;
  updateNode: <P extends NodeProperty>(
    property: P,
    value: NodePropertyValues[P],
    id?: string
  ) => void;
  /** Apply a setting the settings dialog changed to the open map. */
  updateOption: (property: string, value: unknown) => void;
  zoomIn: (duration?: number) => void;
  zoomOut: (duration?: number) => void;
}

export interface DomElements {
  container: d3.Selection<HTMLElement, unknown, null, undefined>;
  g: d3.Selection<SVGGElement, unknown, null, undefined>;
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
}
