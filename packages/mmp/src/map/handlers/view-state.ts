/**
 * Hold the ids of the nodes whose child nodes this person hid. `Nodes` owns
 * the selection and `Draw` owns the rings around selected nodes. ViewState
 * writes nothing into the map data, so no peer, no server and no undo step
 * learns which child nodes are hidden, and a reload shows them again.
 * `Nodes.onChange` deletes the ids of the nodes a change removes.
 */
export default class ViewState {
  private nodesWithHiddenChildren = new Set<string>();

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
   * Delete the ids of removed nodes.
   * @param {string[]} ids
   */
  public forget(ids: string[]) {
    ids.forEach(id => this.nodesWithHiddenChildren.delete(id));
  }
}
