import * as d3 from 'd3';
import type {
  MapNodeCoordinates,
  MapNodeDimensions,
  MapNodeColors,
  MapNodeFont,
  MapNodeImage,
  MapNodeLink,
  Resolved,
  UserNodeProperties,
} from '@teammapper/shared';

/**
 * Style values of a node in the map. The shared `MapNode*` counterparts leave
 * every field optional because the wire format may omit it. A Node the map
 * holds always has a resolved value for each of them.
 */
export type NodeColors = Resolved<MapNodeColors>;
export type NodeFont = Resolved<MapNodeFont>;
export type NodeImage = Resolved<MapNodeImage>;
export type NodeLink = Resolved<MapNodeLink>;

/**
 * Model of the nodes.
 */
export default class Node implements NodeProperties {
  public id: string;
  public parent: Node | null;
  public k: number;

  public name: string;
  public dimensions: MapNodeDimensions;
  public coordinates: MapNodeCoordinates;
  public image: NodeImage;
  public colors: NodeColors;
  public font: NodeFont;
  public link: NodeLink;
  public locked: boolean;
  public dom!: SVGGElement;
  public isRoot: boolean;
  public detached: boolean;
  public hidden: boolean;
  public hasHiddenChildNodes: boolean;

  /**
   * Initialize the node properties, the dimensions and the k coefficient.
   * @param {NodeProperties} properties
   */
  constructor(properties: NodeProperties) {
    this.id = properties.id;
    this.parent = properties.parent;
    this.name = properties.name || '';
    this.coordinates = properties.coordinates || { x: 0, y: 0 };
    this.colors = {
      name: properties.colors?.name || '',
      background: properties.colors?.background || '',
      branch: properties.colors?.branch || '',
      link: properties.colors?.link || '',
    };
    this.image = {
      src: properties.image?.src || '',
      size: properties.image?.size || 0,
    };
    this.font = {
      size: properties.font?.size || 12,
      style: properties.font?.style || 'normal',
      weight: properties.font?.weight || 'normal',
    };
    this.link = { href: properties.link?.href || '' };
    this.locked = Boolean(properties.locked);
    this.isRoot = Boolean(properties.isRoot);
    this.detached = Boolean(properties.detached);
    this.hidden = Boolean(properties.hidden);
    this.hasHiddenChildNodes = Boolean(properties.hasHiddenChildNodes);

    this.dimensions = {
      width: 0,
      height: 0,
    };
    this.k = properties.k || d3.randomUniform(-20, 20)();
  }

  /**
   * Return the level of the node.
   * @returns {number} level
   */
  public getLevel(): number {
    let level = 1,
      parent = this.parent;

    while (parent) {
      level++;
      parent = parent.parent;
    }

    return level;
  }

  /**
   * Return the div element of the node name.
   * @returns {HTMLDivElement} div
   */
  public getNameDOM(): HTMLDivElement {
    return this.dom.querySelector('foreignObject > div') as HTMLDivElement;
  }

  /**
   * Return the SVG path of the node background.
   * @returns {SVGPathElement} path
   */
  public getBackgroundDOM(): SVGPathElement {
    return this.dom.querySelector('path') as SVGPathElement;
  }

  /**
   * Return the SVG image of the node image.
   * @returns {SVGImageElement} image
   */
  public getImageDOM(): SVGImageElement {
    return this.dom.querySelector('image') as SVGImageElement;
  }

  /**
   * Return the SVG a of the node link.
   * @returns {SVGIAElement} a
   */
  public getLinkDOM(): SVGAElement {
    return this.dom.querySelector<SVGAElement>(
      'a > text.link-text'
    ) as SVGAElement;
  }

  /**
   * Returns the SVG text of the hidden child icon.
   * @returns {SVGITextElement} text
   */
  public getHiddenChildIconDOM(): SVGTextElement {
    return this.dom.querySelector<SVGTextElement>(
      'text.hidden-icon'
    ) as SVGTextElement;
  }
}

export interface NodeProperties extends UserNodeProperties {
  id: string;
  parent: Node | null;
  k?: number;
}
