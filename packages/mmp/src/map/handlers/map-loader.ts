import MmpMap from '../map.js';
import * as v from 'valibot';
import { v4 as uuidv4 } from 'uuid';
import { LinkSchema, NodeSchema } from '@teammapper/shared';
import Log from '../../utils/log.js';
import Utils from '../../utils/utils.js';
import { DefaultNodeValues } from '../options.js';
import { randomK } from '../data/node-record.js';
import type {
  ExportNodeProperties,
  MapSnapshot,
  OldMmpNode,
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
 * Replace every node of the map with the nodes of an exported map, or with a
 * new main root. The loader checks the nodes, converts the format mmp 0.1.7
 * exported and writes the result to the map data as one replacement. The
 * change listener then draws the map, selects the main root and centers the
 * view. ViewState keeps the ids of the nodes whose child nodes are hidden
 * apart from the map data, so a load keeps those child nodes hidden.
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
   * Replace the map with `input`, or start a new map holding only a main root
   * when `input` is undefined. An empty `input` leaves the map as it is and
   * throws.
   * @param {MapSnapshot} input
   */
  public load = (input?: MapSnapshot) => {
    if (input === undefined) {
      this.map.data.replaceMap([this.newMainRoot()]);
      return;
    }

    // The conversions below write to the nodes, and the caller keeps its own.
    const nodes = Utils.cloneObject(input);
    if (!this.isValidMap(nodes)) {
      Log.error('The exported map is not correct');
    }
    if (nodes.length === 0) {
      Log.error('The map holds no nodes; the import changed nothing.');
    }

    this.map.data.replaceMap(withMainRoot(nodes.map(this.completed)));
  };

  /** A main root with the map's root node defaults, at the origin. */
  private newMainRoot(): ExportNodeProperties {
    const { name, image, link, colors, font } = Utils.cloneObject(
      this.map.options.rootNode
    );

    return {
      id: uuidv4(),
      parent: '',
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
      parent: merged.parent || '',
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
   * Return true when `nodes` is a list of valid nodes. A map in the legacy
   * format is converted in place first.
   * @param {MapSnapshot} nodes
   * @return {boolean} result
   */
  private isValidMap(nodes: MapSnapshot): boolean {
    if (!Array.isArray(nodes)) {
      return false;
    }

    const firstNode = nodes[0] as unknown;
    if (
      firstNode &&
      typeof firstNode === 'object' &&
      'key' in firstNode &&
      'value' in firstNode
    ) {
      this.convertOldMmp(nodes as unknown as OldMmpNode[]);
    }

    return nodes.every(node => v.is(LoadedNodeSchema, node));
  }

  /**
   * Convert the nodes of a map that mmp 0.1.7 exported to the current format.
   * @param {OldMmpNode[]} nodes
   */
  private convertOldMmp(nodes: OldMmpNode[]) {
    for (const node of nodes) {
      const oldNode = Utils.cloneObject(node);
      const target = node as unknown as Record<string, unknown>;
      Utils.clearObject(target);

      target.id = 'map_node_' + oldNode.key.substr(4);
      target.parent = oldNode.value.parent
        ? 'map_node_' + oldNode.value.parent.substr(4)
        : '';
      target.k = oldNode.value.k;
      target.isRoot = !oldNode.value.parent;
      target.name = oldNode.value.name;
      target.coordinates = {
        x: oldNode.value.x,
        y: oldNode.value.y,
      };
      target.image = {
        size: oldNode.value['image-size']
          ? parseInt(oldNode.value['image-size'], 10)
          : 0,
        src: oldNode.value['image-src'] || '',
      };
      target.colors = {
        background: oldNode.value['background-color'],
        branch: oldNode.value['branch-color'] || '',
        name: oldNode.value['text-color'],
      };
      target.font = {
        size: oldNode.value['font-size']
          ? parseInt(oldNode.value['font-size'], 10)
          : 12,
        weight: oldNode.value.bold ? 'bold' : 'normal',
        style: oldNode.value.italic ? 'italic' : 'normal',
      };
    }
  }
}
