import * as d3 from 'd3';
import type {
  MapNodeCoordinates,
  MapNodeDimensions,
  MapNodeColors,
  MapNodeFont,
  MapNodeImage,
  MapNodeLink,
  MapNodeImageProperties,
  MapNodeLinkProperties,
  MapNodeColorsProperties,
  MapNodeFontProperties,
  UserNodeProperties,
  ExportNodeProperties,
} from '@teammapper/shared';

/**
 * Model of the nodes.
 */
export default class Node implements NodeProperties {
  public id: string;
  public parent: Node | null;
  public k: number;

  public name: string;
  public dimensions: Dimensions;
  public coordinates: Coordinates;
  public image: Image;
  public colors: Colors;
  public font: Font;
  public link: Link;
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
    this.colors = properties.colors || { branch: '' };
    this.image = properties.image || { src: '', size: 0 };
    this.font = properties.font || { size: 12, style: 'normal', weight: 'normal' };
    this.link = properties.link || { href: '' };
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
    return this.dom.querySelector<SVGAElement>('a > text.link-text') as SVGAElement;
  }

  /**
   * Returns the SVG text of the hidden child icon.
   * @returns {SVGITextElement} text
   */
  public getHiddenChildIconDOM(): SVGTextElement {
    return this.dom.querySelector<SVGTextElement>('text.hidden-icon') as SVGTextElement;
  }
}

export type Coordinates = MapNodeCoordinates;
export type Dimensions = MapNodeDimensions;
export type Image = MapNodeImage;
export type Link = MapNodeLink;
export type Colors = MapNodeColors;
export type Font = MapNodeFont;

export type { UserNodeProperties, ExportNodeProperties };

export interface NodeProperties extends UserNodeProperties {
  id: string;
  parent: Node | null;
  k?: number;
}
