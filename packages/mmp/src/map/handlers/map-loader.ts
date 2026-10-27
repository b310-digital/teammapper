import MmpMap from '../map.js';
import * as v from 'valibot';
import { v4 as uuidv4 } from 'uuid';
import {
  ArrowSchema,
  canConnect,
  LinkSchema,
  NodeSchema,
} from '@teammapper/shared';
import Log from '../../utils/log.js';
import Utils from '../../utils/utils.js';
import { DefaultNodeValues } from '../options.js';
import { randomK } from '../data/node-record.js';
import type {
  ExportNodeProperties,
  MapArrow,
  MapSnapshot,
} from '@teammapper/shared';

/**
 * A node of a map the loader accepts. Older maps carry no link and no isRoot
 * attribute.
 */
const LoadedNodeSchema = v.object({
  ...NodeSchema.entries,
  link: v.optional(LinkSchema),
  isRoot: v.optional(v.boolean()),
});

/**
 * The nodes with a main root. A map that names none makes the first node
 * without a parent, in the order of the exported map, its main root, so the
 * load centers and selects it and peers see a replacement. Changes the nodes
 * in place.
 */
function withMainRoot(nodes: ExportNodeProperties[]): ExportNodeProperties[] {
  if (nodes.some(node => node.isRoot)) return nodes;

  const root = nodes.find(node => !node.parent);
  if (root) root.isRoot = true;
  return nodes;
}

/**
 * The arrows the endpoint rules accept, in order: each one is checked against
 * the nodes and the arrows accepted before it, so a repeated arrow drops.
 */
function acceptedArrows(
  nodes: ExportNodeProperties[],
  arrows: unknown[]
): MapArrow[] {
  const accepted: MapArrow[] = [];
  for (const arrow of arrows) {
    if (!v.is(ArrowSchema, arrow)) continue;
    const { source, target } = arrow;
    if (canConnect(nodes, accepted, source, target) === null) {
      accepted.push({ source, target });
    }
  }
  return accepted;
}

/**
 * Replace every node of the map with the nodes of an exported map, or with a
 * new main root. The loader checks the nodes and writes the result to the map
 * data as one replacement. The change listener then draws the map, selects
 * the main root and centers the view. ViewState keeps the ids of the nodes
 * whose child nodes are hidden apart from the map data, so a load keeps those
 * child nodes hidden.
 */
export default class MapLoader {
  private map: MmpMap;

  /**
   * Get the associated map instance.
   * @param {MmpMap} map
   */
  constructor(map: MmpMap) {
    this.map = map;
  }

  /**
   * Replace the map with `input` and `arrows`, or start a new map holding
   * only a main root when `input` is undefined. An empty `input` leaves the
   * map as it is and throws. The arrows arrive unchecked, as an imported file
   * holds them: the map keeps each entry that matches the arrow schema and
   * the endpoint rules accept against the loaded nodes, and holds no arrows
   * when the caller passes none.
   * @param {MapSnapshot} input
   * @param {unknown[]} arrows
   */
  public load = (input?: MapSnapshot, arrows: unknown[] = []) => {
    if (input === undefined) {
      this.map.data.replaceMap([this.newMainRoot()]);
      return;
    }

    // withMainRoot writes to the nodes, and the caller keeps its own.
    const nodes = Utils.cloneObject(input);
    if (!this.isValidMap(nodes)) {
      Log.error('The exported map is not correct');
    }
    if (nodes.length === 0) {
      Log.error('The map holds no nodes; the import changed nothing.');
    }

    const loaded = withMainRoot(nodes.map(this.completed));
    this.map.data.replaceMap(loaded, acceptedArrows(loaded, arrows));
  };

  /** A main root with the map's root node defaults, at the origin. */
  private newMainRoot(): ExportNodeProperties {
    const { name, image, link, colors, font } = Utils.cloneObject(
      this.map.options.rootNode
    );

    return {
      id: uuidv4(),
      parent: null,
      k: randomK(),
      name,
      coordinates: { x: 0, y: 0 },
      image,
      colors,
      font,
      link,
      protected: false,
      isRoot: true,
    };
  }

  /**
   * The node as the map data stores it, with only the fields a node has. A
   * map exported by an older release may lack a property, and the defaults
   * fill it in. A node without a k, or with 0, gets a random one.
   * @param {ExportNodeProperties} node
   */
  private completed = (node: ExportNodeProperties): ExportNodeProperties => {
    const merged = Utils.cloneObject({ ...DefaultNodeValues, ...node });

    return {
      id: merged.id,
      parent: merged.parent || null,
      k: merged.k || randomK(),
      name: merged.name,
      coordinates: merged.coordinates,
      image: merged.image,
      colors: merged.colors,
      font: merged.font,
      link: merged.link,
      protected: merged.protected ?? false,
      isRoot: merged.isRoot,
    };
  };

  /**
   * Return true when `nodes` is a list of valid nodes.
   * @param {MapSnapshot} nodes
   * @return {boolean} result
   */
  private isValidMap(nodes: MapSnapshot): boolean {
    return (
      Array.isArray(nodes) && nodes.every(node => v.is(LoadedNodeSchema, node))
    );
  }
}
