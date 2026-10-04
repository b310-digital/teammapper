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
 * A node of a snapshot the map accepts. Older maps carry no link and no
 * isRoot attribute.
 */
const SnapshotNodeSchema = v.object({
  ...NodeSchema.entries,
  link: v.optional(LinkSchema),
  isRoot: v.optional(v.boolean()),
});

/**
 * Hold the snapshot of the current map and rebuild the map from one.
 */
export default class History {
  private map: Map;

  private snapshot: MapSnapshot;

  /**
   * Get the associated map instance and start with an empty snapshot.
   * @param {Map} map
   */
  constructor(map: Map) {
    this.map = map;

    this.snapshot = [];
  }

  /**
   * Return the snapshot of the current map.
   * @return {MapSnapshot} snapshot
   */
  public current = (): MapSnapshot => {
    return this.snapshot;
  };

  /**
   * Replace old map with a new one or create a new empty map.
   * @param {MapSnapshot} snapshot
   */
  public new = (input?: MapSnapshot, notifyWithEvent = true) => {
    // The conversions below write to the snapshot, and the caller keeps its own.
    const snapshot = input === undefined ? undefined : Utils.cloneObject(input);

    if (snapshot === undefined) {
      this.map.nodes.clear();

      this.map.draw.clear();
      this.map.draw.update();

      this.map.nodes.addRootNode();

      this.map.zoom.center('position', 0);

      this.save();

      if (notifyWithEvent) this.map.events.emit('create', {});
    } else if (this.checkSnapshotStructure(snapshot)) {
      const previousData = this.map.export.asJSON();

      this.reapplyHiddenState(previousData, snapshot);

      this.redraw(snapshot);

      this.map.zoom.center('position', 0);

      // If the amount of nodes is == 0, automatically rollback to the last clean snapshot and display a toast
      if (this.map.nodes.getNodes().length === 0) {
        if (previousData.length > 0) {
          this.redraw(previousData);
        }
        Log.error(
          'There was an error importing the map; changes have been rolled back.'
        );
      } else {
        this.save();
        if (notifyWithEvent) {
          this.map.events.emit('create', { previousMapData: previousData });
        }
      }
    } else {
      Log.error('The snapshot is not correct');
    }
  };

  /**
   * Save the current snapshot of the mind map.
   */
  public save() {
    this.snapshot = this.getSnapshot();
  }

  /**
   * Redraw the map with a new snapshot.
   * @param {MapSnapshot} snapshot
   */
  private redraw(snapshot: MapSnapshot) {
    this.map.nodes.clear();

    snapshot.forEach((property: ExportNodeProperties) => {
      // in case the data model changes this makes sure all properties are at least present using defaults
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
        hidden: mergedProperty.hidden,
        hasHiddenChildNodes: mergedProperty.hasHiddenChildNodes,
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
   * Return a copy of all fundamental node properties.
   * @return {MapSnapshot} properties
   */
  private getSnapshot(): MapSnapshot {
    return this.map.nodes
      .getNodes()
      .map((node: Node) => {
        return this.map.nodes.getNodeProperties(node, false);
      })
      .slice();
  }

  /**
   * Check the snapshot structure and return true if it is authentic.
   * @param {MapSnapshot} snapshot
   * @return {boolean} result
   */
  private checkSnapshotStructure(snapshot: MapSnapshot): boolean {
    if (!Array.isArray(snapshot)) {
      return false;
    }

    const firstNode = snapshot[0] as unknown;
    if (
      firstNode &&
      typeof firstNode === 'object' &&
      'key' in firstNode &&
      'value' in firstNode
    ) {
      this.convertOldMmp(snapshot as unknown as OldMmpNode[]);
    }

    return snapshot.every(node => v.is(SnapshotNodeSchema, node));
  }

  /**
   * Convert the old mmp (version: 0.1.7) snapshot to new.
   * @param {OldMmpNode[]} snapshot
   */
  private convertOldMmp(snapshot: OldMmpNode[]) {
    for (const node of snapshot) {
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

  /**
   * Find nodes that were previously hidden locally and re-apply attributes
   * @param {MapSnapshot} previousData
   * @param {MapSnapshot} snapshot
   */
  private reapplyHiddenState(
    previousData: MapSnapshot,
    snapshot: MapSnapshot
  ): void {
    // Find all nodes where we've set hasHiddenChildNodes in the previous map
    const nodesWithHiddenChildren = previousData.filter(
      node => node.hasHiddenChildNodes
    );

    // This method will recursively hide all children of children until none are left
    const hideChildNodes = (parentId: string) =>
      snapshot
        .filter(node => node.parent === parentId)
        .forEach(node => {
          node.hidden = true;
          hideChildNodes(node.id);
        });

    snapshot.forEach(snapshotNode => {
      const nodeWithHiddenChildren = nodesWithHiddenChildren.find(
        x => snapshotNode.id === x.id
      );

      if (nodeWithHiddenChildren) {
        snapshotNode.hasHiddenChildNodes = true;

        // We need to iterate through the snapshot instead of using this.map.nodes.nodeChildren() to see if we need to set hidden attributes as the latter will not have new nodes added yet
        snapshot
          .filter(node => node.parent === snapshotNode.id)
          .forEach(node => {
            node.hidden = true;
            hideChildNodes(node.id);
          });
      }
    });
  }
}
