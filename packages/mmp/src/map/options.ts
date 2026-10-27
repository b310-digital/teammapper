import type {
  NodeColors,
  NodeFont,
  NodeImage,
  NodeLink,
} from './data/node-record.js';
import {
  branchStyleOf,
  type BranchStyle,
  type ImageReference,
  type MapNodeCoordinates,
  type MapNodeSettings,
} from '@teammapper/shared';
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
  // Allows editing through the pointer and keyboard. The edit handlers read
  // the flag when an event arrives. Node property updates work either way.
  public edit: boolean;

  public defaultNode: DefaultNodeProperties;
  public rootNode: DefaultNodeProperties;
  public showLinktext: boolean;
  public branchStyle: BranchStyle;
  public resolveImageUrl?: ImageUrlResolver;

  /**
   * Initialize all options.
   * @param {OptionParameters} parameters
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
    this.branchStyle = branchStyleOf(parameters.branchStyle);
    this.resolveImageUrl = parameters.resolveImageUrl;

    this.defaultNode = withDefaults(DefaultNodeValues, parameters.defaultNode);
    this.rootNode = withDefaults(DefaultRootNodeValues, parameters.rootNode);
  }

  /**
   * Apply a changed setting to the open map. Edit and drag change through
   * `MmpInstance.setEditable`.
   */
  public update = (property: string, value: unknown) => {
    if (typeof property !== 'string') {
      Log.error('The property must be a string', 'type');
    }

    switch (property) {
      case 'centerOnResize':
        this.updateCenterOnResize(value as boolean);
        break;
      case 'showLinktext':
        this.updateShowLinktext(value as boolean);
        break;
      case 'branchStyle':
        this.updateBranchStyle(value);
        break;
      case 'defaultNode':
        this.defaultNode = withDefaults(
          DefaultNodeValues,
          value as MapNodeSettings
        );
        break;
      case 'rootNode':
        this.rootNode = withDefaults(
          DefaultRootNodeValues,
          value as MapNodeSettings
        );
        break;
      default:
        Log.error('The property does not exist');
    }
  };

  /**
   * Update whether a window resize centers the map.
   * @param {boolean} flag
   */
  private updateCenterOnResize(flag: boolean) {
    if (typeof flag !== 'boolean') {
      Log.error('The value must be a boolean', 'type');
    }

    if (flag === this.centerOnResize) return;
    this.centerOnResize = flag;

    this.map.centerOnWindowResize(flag);
  }

  /**
   * Update whether nodes show the text of their link.
   * @param {boolean} flag
   */
  private updateShowLinktext(flag: boolean) {
    if (typeof flag !== 'boolean') {
      Log.error('The value must be a boolean', 'type');
    }

    if (flag === this.showLinktext) return;
    this.showLinktext = flag;

    this.map.draw.drawAll();
  }

  /**
   * Update how branches are drawn. An unknown value draws tapered branches.
   * @param {unknown} value
   */
  private updateBranchStyle(value: unknown) {
    const style = branchStyleOf(value);
    if (style === this.branchStyle) return;
    this.branchStyle = style;

    this.map.draw.drawAll();
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
  isRoot: true,
};

/** The node defaults with the caller's settings merged over them. */
function withDefaults(
  defaults: DefaultNodeProperties,
  settings: MapNodeSettings | undefined
): DefaultNodeProperties {
  return Utils.mergeObjects(defaults, settings, true) as DefaultNodeProperties;
}

export interface DefaultNodeProperties {
  name: string;
  image: NodeImage;
  coordinates: MapNodeCoordinates;
  link: NodeLink;
  colors: NodeColors;
  font: NodeFont;
  isRoot: boolean;
}

/**
 * Returns the URL an image reference loads from, or null when it has none.
 * The library names no API path; the caller knows the map and the server.
 */
export type ImageUrlResolver = (reference: ImageReference) => string | null;

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
  branchStyle?: BranchStyle;
  resolveImageUrl?: ImageUrlResolver;
}
