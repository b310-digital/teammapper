import * as d3 from 'd3';
import type {
  MapNodeCoordinates,
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
  public coordinates: MapNodeCoordinates;
  public image: NodeImage;
  public colors: NodeColors;
  public font: NodeFont;
  public link: NodeLink;
  public protected: boolean;
  public isRoot: boolean;

  /**
   * Initialize the node properties and the k coefficient.
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
    this.protected = Boolean(properties.protected);
    this.isRoot = Boolean(properties.isRoot);

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
}

export interface NodeProperties extends UserNodeProperties {
  id: string;
  parent: Node | null;
  k?: number;
}
