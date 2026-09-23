import * as d3 from 'd3';
import Events from './handlers/events.js';
import Zoom from './handlers/zoom.js';
import Draw from './handlers/draw.js';
import Options, { OptionParameters } from './options.js';
import History from './handlers/history.js';
import Drag from './handlers/drag.js';
import Nodes from './handlers/nodes.js';
import Export from './handlers/export.js';
import CopyPaste from './handlers/copy-paste.js';
import Node from './models/node.js';
import type {
  ExportNodeProperties,
  MapNodeCoordinates,
  MapSnapshot,
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
  public rootId: string;

  public options: Options;
  public history: History;
  public events: Events;
  public zoom: Zoom;
  public draw: Draw;
  public drag: Drag;
  public nodes: Nodes;
  public export: Export;
  public copyPaste: CopyPaste;

  public instance!: MmpInstance;

  /**
   * Create all handler instances, set some map behaviors and return a mmp instance.
   * @param {string} id
   * @param {OptionParameters} options
   * @returns {MmpInstance} mmpInstance
   */
  constructor(id: string, ref: HTMLElement, options?: OptionParameters) {
    this.id = id;

    this.events = new Events();
    this.options = new Options(options, this);
    this.zoom = new Zoom(this);
    this.history = new History(this);
    this.drag = new Drag(this);
    this.draw = new Draw(this, ref);
    this.nodes = new Nodes(this);
    this.export = new Export(this);
    this.copyPaste = new CopyPaste(this);
    this.rootId = '';

    this.dom = this.draw.create();

    if (this.options.centerOnResize === true) {
      d3.select(window).on('resize.' + this.id, () => {
        this.zoom.center();
      });
    }

    if (this.options.zoom === true) {
      this.dom.svg.call(this.zoom.getZoomBehavior());
    }

    this.history.save();

    this.createMmpInstance();
  }

  /**
   * Remove permanently mmp instance.
   */
  private remove = () => {
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
      addNodes: this.nodes.addNodes,
      center: this.zoom.center,
      copyNode: this.copyPaste.copy,
      cutNode: this.copyPaste.cut,
      applyCoordinatesToMapSnapshot: this.nodes.applyCoordinatesToMapSnapshot,
      distributeNodes: this.nodes.distributeNodes,
      getSelectedNode: this.nodes.getSelectedNode,
      editNode: this.nodes.editNode,
      toggleBranchVisibility: this.nodes.toggleBranchVisibility,
      existNode: this.nodes.existNode,
      exportAsImage: this.export.asImage,
      exportAsJSON: this.export.asJSON,
      exportRootProperties: this.nodes.exportRootProperties,
      highlightNode: this.nodes.highlightNodeWithColor,
      new: this.history.new,
      newTreeCoordinates: this.nodes.newTreeCoordinates,
      nodeChildren: this.nodes.nodeChildren,
      on: this.events.on,
      pasteNode: this.copyPaste.paste,
      remove: this.remove,
      removeNode: this.nodes.removeNode,
      selectNode: this.nodes.selectNode,
      unsubscribeAll: this.events.unsubscribeAll,
      updateNode: this.nodes.updateNode,
      zoomIn: this.zoom.zoomIn,
      zoomOut: this.zoom.zoomOut,
    });
  }
}

export interface MmpInstance {
  addNode: (
    userProperties?: UserNodeProperties,
    notifyWithEvent?: boolean,
    updateHistory?: boolean,
    parentId?: string | null,
    overwriteId?: string
  ) => Node;
  addNodes: (nodes: ExportNodeProperties[], updateHistory?: boolean) => void;
  center: (type?: 'zoom' | 'position', duration?: number) => void;
  copyNode: (id?: string) => void;
  cutNode: (id?: string) => void;
  applyCoordinatesToMapSnapshot: (mapSnapshot: MapSnapshot) => MapSnapshot;
  distributeNodes: (notifyWithEvent?: boolean) => void;
  getSelectedNode: () => Node | null;
  editNode: () => void;
  toggleBranchVisibility: () => void;
  existNode: (id?: string) => boolean;
  exportAsImage: (callback: (url: string) => void, type?: string) => void;
  exportAsJSON: () => MapSnapshot;
  exportRootProperties: () => ExportNodeProperties;
  highlightNode: (id: string, color: string, notifyWithEvent?: boolean) => void;
  new: (snapshot?: MapSnapshot, notifyWithEvent?: boolean) => void;
  newTreeCoordinates: () => MapNodeCoordinates;
  nodeChildren: (id?: string) => ExportNodeProperties[];
  on: (event: string, callback: (...args: unknown[]) => void) => void;
  pasteNode: (id?: string) => void;
  remove: () => void;
  removeNode: (id?: string, notifyWithEvent?: boolean) => void;
  selectNode: (id?: string) => ExportNodeProperties | null;
  unsubscribeAll: () => void;
  updateNode: (
    property: NodeProperty | string,
    value: NodePropertyValue | unknown,
    notifyWithEvent?: boolean,
    updateHistory?: boolean,
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
