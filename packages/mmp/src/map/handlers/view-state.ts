import type { MapViewState } from '@teammapper/shared';
import type Node from '../models/node.js';
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
   * @param {Node} node
   */
  public hidesChildren(node: Node): boolean {
    return this.nodesWithHiddenChildren.has(node.id);
  }

  /**
   * The ids of the nodes below a node whose child nodes this person hid. A
   * walk down an ancestor cycle stops at the node it started from.
   */
  public hiddenNodeIds(): Set<string> {
    const childrenOf = new Map<string, Node[]>();
    for (const node of this.map.nodes.getNodes()) {
      if (!node.parent) continue;
      const children = childrenOf.get(node.parent.id) ?? [];
      children.push(node);
      childrenOf.set(node.parent.id, children);
    }

    const hidden = new Set<string>();
    for (const id of this.nodesWithHiddenChildren) {
      const visited = new Set<string>([id]);
      const pending = [...(childrenOf.get(id) ?? [])];
      for (let node = pending.pop(); node; node = pending.pop()) {
        if (visited.has(node.id)) continue;
        visited.add(node.id);
        hidden.add(node.id);
        pending.push(...(childrenOf.get(node.id) ?? []));
      }
    }
    return hidden;
  }

  /**
   * Hide the child nodes of the node, or show them when they are hidden.
   * @param {Node} node
   */
  public toggle(node: Node) {
    if (!this.nodesWithHiddenChildren.delete(node.id)) {
      this.nodesWithHiddenChildren.add(node.id);
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
    if (this.map.nodes.getNodes().length > 0) this.map.draw.update();
  }
}
