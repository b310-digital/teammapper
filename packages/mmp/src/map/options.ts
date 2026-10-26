import type {
  NodeColors,
  NodeFont,
  NodeImage,
  NodeLink,
} from './data/node-record.js';
import type {
  ImageReference,
  MapNodeCoordinates,
  MapNodeSettings,
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
  // Controls wether edit related click handlers will be registered in the draw module
  // Note: node property updates are still available
  public edit: boolean;

  public defaultNode: DefaultNodeProperties;
  public rootNode: DefaultNodeProperties;
  public showLinktext: boolean;
  public resolveImageUrl?: ImageUrlResolver;

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
    this.resolveImageUrl = parameters.resolveImageUrl;

    this.defaultNode = withDefaults(DefaultNodeValues, parameters.defaultNode);
    this.rootNode = withDefaults(DefaultRootNodeValues, parameters.rootNode);
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
      case 'centerOnResize':
        this.updateCenterOnResize(value as boolean);
        break;
      case 'showLinktext':
        this.updateShowLinktext(value as boolean);
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
   * Update drag behavior.
   * @param {boolean} flag
   */
  private updateDrag(flag: boolean) {
    if (typeof flag !== 'boolean') {
      Log.error('The value must be a boolean', 'type');
    }

    // The drag behavior reads the flag when a drag starts.
    this.drag = flag;
  }

  /**
   * Update edit behavior.
   * @param {boolean} flag
   */
  private updateEdit(flag: boolean) {
    if (typeof flag !== 'boolean') {
      Log.error('The value must be a boolean', 'type');
    }

    // The edit handlers read the flag when an event arrives. A name edit
    // that runs already holds its own handlers, so turning edit off ends it.
    this.edit = flag;
    if (!flag) this.map.draw.cancelNameEditing();
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
  resolveImageUrl?: ImageUrlResolver;
}
