import Node from './node.js';

/**
 * Hold the nodes of a map by id. `Nodes` answers the tree queries over them.
 * The store reads and writes the model only and never touches the DOM.
 */
export default class NodeStore {
  private nodes = new Map<string, Node>();

  public get(id: string): Node | undefined {
    return this.nodes.get(id);
  }

  public has(id: string): boolean {
    return this.nodes.has(id);
  }

  public set(node: Node) {
    this.nodes.set(node.id, node);
  }

  public delete(id: string) {
    this.nodes.delete(id);
  }

  public clear() {
    this.nodes.clear();
  }

  public all(): Node[] {
    return Array.from(this.nodes.values());
  }
}
