import * as d3 from 'd3';
import Events, { MmpEventCallback } from './handlers/events.js';
import Zoom from './handlers/zoom.js';
import Draw from './handlers/draw.js';
import Options, { OptionParameters } from './options.js';
import MapLoader from './handlers/map-loader.js';
import Drag from './handlers/drag.js';
import Nodes from './handlers/nodes.js';
import Export from './handlers/export.js';
import CopyPaste from './handlers/copy-paste.js';
import ViewState from './handlers/view-state.js';
import type { MapData } from './data/map-data.js';
import type {
  ExportNodeProperties,
  MapSnapshot,
  MmpEventType,
  NodeProperty,
  NodePropertyValue,
  UserNodeProperties,
} from '@teammapper/shared';

/**
 * Initialize all handlers and return a mmp object.
 */
export default class MmpMap {
  public id: string;
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

  public instance!: MmpInstance;

  private readonly unsubscribeData: () => void;

  /**
   * Create all handler instances, set some map behaviors, draw the nodes the
   * map data holds and return a mmp instance. The map selects the main root
   * and fires `nodeSelect`, and emits no `mapChange` for this first draw.
   * @param {string} id
   * @param {HTMLElement} ref
   * @param {OptionParameters} options
   * @param {MapData} data
   */
  constructor(
    id: string,
    ref: HTMLElement,
    options: OptionParameters | undefined,
    data: MapData
  ) {
    this.id = id;
    this.data = data;

    this.events = new Events();
    this.options = new Options(options, this);
    this.zoom = new Zoom(this);
    this.viewState = new ViewState();
    this.loader = new MapLoader(this);
    this.drag = new Drag(this);
    this.draw = new Draw(this, ref);
    this.nodes = new Nodes(this);
    this.export = new Export(this);
    this.copyPaste = new CopyPaste(this);

    this.dom = this.draw.create();

    if (this.options.centerOnResize === true) {
      d3.select(window).on('resize.' + this.id, () => {
        this.zoom.center();
      });
    }

    if (this.options.zoom === true) {
      this.dom.svg.call(this.zoom.getZoomBehavior());
    }

    this.createMmpInstance();

    this.unsubscribeData = data.subscribe(this.nodes.onChange);
    this.nodes.drawReplaced();
  }

  /**
   * Remove the map for good: its svg, every subscription and the resize
   * listener on the window.
   */
  private destroy = () => {
    d3.select(window).on('resize.' + this.id, null);
    this.unsubscribeData();
    this.events.unsubscribeAll();
    this.draw.destroy();
    this.dom.svg.remove();

    const instanceRecord = this.instance as unknown as Record<string, unknown>;
    const props = Object.keys(instanceRecord);
    for (const prop of props) {
      delete instanceRecord[prop];
    }
  };

  /**
   * Return a mmp instance with all mmp library functions.
   * @return {MmpInstance} mmpInstance
   */
  private createMmpInstance(): MmpInstance {
    return (this.instance = {
      addNode: this.nodes.addNode,
      addTree: this.nodes.addTree,
      center: this.zoom.center,
      copyNode: this.copyPaste.copy,
      cutNode: this.copyPaste.cut,
      applyCoordinatesToMapSnapshot: this.nodes.applyCoordinatesToMapSnapshot,
      distributeNodes: this.nodes.distributeNodes,
      getSelectedNode: this.nodes.getSelectedNode,
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
      removeNode: this.nodes.removeNode,
      selectNode: this.nodes.selectNode,
      updateNode: this.nodes.updateNode,
      zoomIn: this.zoom.zoomIn,
      zoomOut: this.zoom.zoomOut,
    });
  }
}

/**
 * The functions the mmp library offers. Every node it returns is a copy the
 * caller may change; the map data keeps its own.
 */
export interface MmpInstance {
  addNode: (
    userProperties?: UserNodeProperties,
    parentId?: string | null,
    overwriteId?: string
  ) => ExportNodeProperties | null;
  addTree: () => ExportNodeProperties | null;
  center: (type?: 'zoom' | 'position', duration?: number) => void;
  copyNode: (id?: string) => void;
  cutNode: (id?: string) => boolean;
  applyCoordinatesToMapSnapshot: (mapSnapshot: MapSnapshot) => MapSnapshot;
  distributeNodes: () => void;
  getSelectedNode: () => ExportNodeProperties | null;
  editNode: () => void;
  toggleBranchVisibility: () => void;
  childNodesHidden: (id?: string) => boolean;
  existNode: (id?: string) => boolean;
  exportAsImage: (callback: (url: string) => void, type?: string) => void;
  exportAsJSON: () => MapSnapshot;
  exportRootProperties: () => ExportNodeProperties | null;
  highlightNode: (id: string, color: string) => void;
  new: (nodes?: MapSnapshot) => void;
  nodeChildren: (id?: string) => ExportNodeProperties[];
  on: <K extends MmpEventType>(event: K, callback: MmpEventCallback<K>) => void;
  pasteNode: (id?: string) => void;
  pasteTree: () => void;
  protectBranch: (id?: string) => void;
  protectingNode: (id?: string) => string | null;
  releaseBranch: (id?: string) => void;
  destroy: () => void;
  removeNode: (id?: string) => void;
  selectNode: (id?: string) => ExportNodeProperties | null;
  updateNode: (
    property: NodeProperty | string,
    value: NodePropertyValue | unknown,
    id?: string
  ) => void;
  zoomIn: (duration?: number) => void;
  zoomOut: (duration?: number) => void;
}

export interface DomElements {
  container: d3.Selection<HTMLElement, unknown, null, undefined>;
  g: d3.Selection<SVGGElement, unknown, null, undefined>;
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
}
