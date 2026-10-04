import type { MapViewState } from '@teammapper/shared';
import type MmpMap from '../map.js';

/**
 * Hold the ids of the nodes whose child nodes this person hid. `Nodes` owns
 * the selection and `Draw` owns the rings around selected nodes. ViewState
 * writes nothing into the map data, so mmp sends no hidden child nodes to a
 * peer, the server or the undo stack.
 *
 * The set may hold the id of a node that has not arrived yet, such as a node
 * a peer added before the first sync. Such an id hides nothing until its node
 * exists. `Nodes.removeNode` deletes the ids of the nodes it removes.
 */
export default class ViewState {
  private map: MmpMap;
  private nodesWithHiddenChildren = new Set<string>();

  constructor(map: MmpMap) {
    this.map = map;
  }

  /**
   * True when this person hid the child nodes of the node.
   * @param {string} id
   */
  public hidesChildren(id: string): boolean {
    return this.nodesWithHiddenChildren.has(id);
  }

  /** True when this person hid no child nodes. */
  public isEmpty(): boolean {
    return this.nodesWithHiddenChildren.size === 0;
  }

  /**
   * Hide the child nodes of the node, or show them when they are hidden.
   * @param {string} id
   */
  public toggle(id: string) {
    if (!this.nodesWithHiddenChildren.delete(id)) {
      this.nodesWithHiddenChildren.add(id);
    }
  }

  /**
   * Delete the ids of removed nodes. Return true when the set held one.
   * @param {string[]} ids
   */
  public forget(ids: string[]): boolean {
    return ids.filter(id => this.nodesWithHiddenChildren.delete(id)).length > 0;
  }

  /** Return every id in the set, the ids of nodes the store lacks included. */
  public export(): MapViewState {
    return { nodesWithHiddenChildren: [...this.nodesWithHiddenChildren] };
  }

  /**
   * Replace the view state and redraw the map when it holds nodes. Emits no
   * event.
   * @param {MapViewState} state
   */
  public restore(state: MapViewState) {
    this.nodesWithHiddenChildren = new Set(state.nodesWithHiddenChildren);
    if (this.map.nodes.scan().size > 0) this.map.draw.update();
  }
}
