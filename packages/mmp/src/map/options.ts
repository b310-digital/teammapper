import { NodeColors, NodeFont, NodeImage, NodeLink } from './models/node.js';
import type { MapNodeCoordinates, MapNodeSettings } from '@teammapper/shared';
import Utils from '../utils/utils.js';
import Map from './map.js';
import Log from '../utils/log.js';

/**
 * Manage default map options.
 */
export default class Options implements OptionParameters {
  private map: Map;

  public fontFamily: string;
  public centerOnResize: boolean;
  public drag: boolean;
  public zoom: boolean;
  // Controls wether edit related click handlers will be registered in the draw module
  // Note: node property updates are still available
  public edit: boolean;

  public defaultNode: DefaultNodeProperties;
  public rootNode: DefaultNodeProperties;
  public showLinktext: boolean;

  /**
   * Initialize all options.
   * @param {OptionParameters} parameters
   * @param {Map} map
   */
  constructor(parameters: OptionParameters = {}, map: Map) {
    this.map = map;

    this.fontFamily = parameters.fontFamily || 'Arial, Helvetica, sans-serif';
    this.centerOnResize =
      parameters.centerOnResize !== undefined
        ? parameters.centerOnResize
        : true;
    this.drag = parameters.drag !== undefined ? parameters.drag : true;
    this.edit = parameters.edit !== undefined ? parameters.edit : true;
    this.zoom = parameters.zoom !== undefined ? parameters.zoom : true;
    this.showLinktext =
      parameters.showLinktext !== undefined ? parameters.showLinktext : false;

    // Default node properties
    this.defaultNode = Utils.mergeObjects(
      DefaultNodeValues,
      parameters.defaultNode,
      true
    ) as DefaultNodeProperties;

    // Default root node properties
    this.rootNode = Utils.mergeObjects(
      DefaultRootNodeValues,
      parameters.rootNode,
      true
    ) as DefaultNodeProperties;
  }

  public update = (property: string, value: unknown) => {
    if (typeof property !== 'string') {
      Log.error('The property must be a string', 'type');
    }

    switch (property) {
      case 'drag':
        this.updateDrag(value as boolean);
        break;
      case 'edit':
        this.updateEdit(value as boolean);
        break;
      default:
        Log.error('The property does not exist');
    }
  };

  /**
   * Update drag behavior.
   * @param {boolean} flag
   */
  private updateDrag(flag: boolean) {
    if (typeof flag !== 'boolean') {
      Log.error('The value must be a boolean', 'type');
    }

    this.drag = flag;

    this.map.draw.clear();
    this.map.draw.update();
  }

  /**
   * Update edit behavior.
   * @param {boolean} flag
   */
  private updateEdit(flag: boolean) {
    if (typeof flag !== 'boolean') {
      Log.error('The value must be a boolean', 'type');
    }

    this.edit = flag;

    this.map.draw.clear();
    this.map.draw.update();
  }
}

export const DefaultNodeValues: DefaultNodeProperties = {
  name: '',
  link: {
    href: '',
  },
  coordinates: {
    x: 0,
    y: 0,
  },
  image: {
    src: '',
    size: 60,
  },
  colors: {
    name: '#787878',
    background: '#f9f9f9',
    branch: '#577a96',
    link: '#000000',
  },
  font: {
    size: 16,
    style: 'normal',
    weight: 'normal',
  },
  locked: true,
  hidden: false,
  isRoot: false,
};

export const DefaultRootNodeValues: DefaultNodeProperties = {
  name: 'Root node',
  link: {
    href: '',
  },
  coordinates: {
    x: 0,
    y: 0,
  },
  image: {
    src: '',
    size: 70,
  },
  colors: {
    name: '#787878',
    background: '#f0f6f5',
    branch: '',
    link: '#000000',
  },
  font: {
    size: 20,
    style: 'normal',
    weight: 'normal',
  },
  locked: true,
  isRoot: true,
  hidden: false,
};

export interface DefaultNodeProperties {
  name: string;
  image: NodeImage;
  coordinates: MapNodeCoordinates;
  link: NodeLink;
  colors: NodeColors;
  font: NodeFont;
  locked: boolean;
  isRoot: boolean;
  hidden: boolean;
}

export interface OptionParameters {
  fontFamily?: string;
  centerOnResize?: boolean;
  drag?: boolean;
  edit?: boolean;
  zoom?: boolean;
  // What a caller supplies is the settings payload, which carries no position
  // and no tree membership. Options fills the rest in from DefaultNodeValues.
  defaultNode?: MapNodeSettings;
  rootNode?: MapNodeSettings;
  showLinktext?: boolean;
}
