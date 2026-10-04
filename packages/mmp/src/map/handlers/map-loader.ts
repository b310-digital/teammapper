import Map from '../map.js';
import Node, { NodeProperties } from '../models/node.js';
import * as v from 'valibot';
import { LinkSchema, NodeSchema } from '@teammapper/shared';
import Log from '../../utils/log.js';
import Utils from '../../utils/utils.js';
import { DefaultNodeValues } from '../options.js';
import type {
  ExportNodeProperties,
  MapNodeColors,
  MapNodeCoordinates,
  MapNodeFont,
  MapNodeImage,
  MapNodeLink,
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
 * Replace every node of the map with the nodes of an exported map, or with a
 * new main root. The loader checks the nodes and converts the format mmp
 * 0.1.7 exported. ViewState keeps its set apart from the node store, so a
 * load keeps hidden child nodes hidden.
 */
export default class MapLoader {
  private map: Map;

  /**
   * Get the associated map instance.
   * @param {Map} map
   */
  constructor(map: Map) {
    this.map = map;
  }

  /**
   * Replace the map with `input`, or start a new map holding only a main root
   * when `input` is undefined. An empty `input` leaves the map as it is and
   * throws.
   * @param {MapSnapshot} input
   * @param {boolean} notifyWithEvent
   */
  public load = (input?: MapSnapshot, notifyWithEvent = true) => {
    if (input === undefined) {
      this.loadEmptyMap(notifyWithEvent);
      return;
    }

    // The conversions below write to the nodes, and the caller keeps its own.
    const nodes = Utils.cloneObject(input);
    if (!this.isValidMap(nodes)) {
      Log.error('The snapshot is not correct');
    }
    if (nodes.length === 0) {
      Log.error(
        'There was an error importing the map; changes have been rolled back.'
      );
    }

    const previousData = this.map.export.asJSON();
    this.replaceNodes(nodes);
    this.map.zoom.center('position', 0);

    if (notifyWithEvent) {
      this.map.events.emit('create', { previousMapData: previousData });
    }
  };

  /**
   * Replace the map with a main root alone.
   * @param {boolean} notifyWithEvent
   */
  private loadEmptyMap(notifyWithEvent: boolean) {
    this.map.nodes.clear();

    this.map.draw.clear();
    this.map.draw.update();

    this.map.nodes.addRootNode();

    this.map.zoom.center('position', 0);

    if (notifyWithEvent) this.map.events.emit('create', {});
  }

  /**
   * Replace every node of the map with `nodes` and draw the map again.
   * @param {MapSnapshot} nodes
   */
  private replaceNodes(nodes: MapSnapshot) {
    this.map.nodes.clear();

    nodes.forEach((property: ExportNodeProperties) => {
      // A map exported by an older release may lack a property; the defaults
      // fill it in.
      const mergedProperty = {
        ...DefaultNodeValues,
        ...property,
      } as ExportNodeProperties;
      const properties: NodeProperties = {
        id: mergedProperty.id,
        parent: mergedProperty.parent
          ? (this.map.nodes.getNode(mergedProperty.parent) ?? null)
          : null,
        k: mergedProperty.k,
        name: mergedProperty.name,
        coordinates: Utils.cloneObject(
          mergedProperty.coordinates
        ) as MapNodeCoordinates,
        image: Utils.cloneObject(mergedProperty.image) as MapNodeImage,
        colors: Utils.cloneObject(mergedProperty.colors) as MapNodeColors,
        font: Utils.cloneObject(mergedProperty.font) as MapNodeFont,
        link: Utils.cloneObject(mergedProperty.link) as MapNodeLink,
        protected: mergedProperty.protected,
        isRoot: mergedProperty.isRoot,
      };

      const node: Node = new Node(properties);
      this.map.nodes.setNode(node);

      if (mergedProperty.isRoot) this.map.rootId = mergedProperty.id;
    });

    this.map.draw.clear();
    this.map.draw.update();

    this.map.nodes.selectRootNode();
  }

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
