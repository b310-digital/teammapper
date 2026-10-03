import Node from './node.js';

/**
 * Hold the nodes of a map and answer the tree queries over them. The store
 * reads and writes the model only and never touches the DOM.
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

  public children(node: Node): Node[] {
    return this.all().filter(n => n.parent?.id === node.id);
  }

  /** Every node below `node`, each parent before its own children. */
  public descendants(node: Node): Node[] {
    return this.children(node).flatMap(child => [
      child,
      ...this.descendants(child),
    ]);
  }

  /** The other children of the node's parent, none for a root. */
  public siblings(node: Node): Node[] {
    const parent = node.parent;
    if (!parent) return [];

    return this.children(parent).filter(n => n !== node);
  }

  /**
   * The root of the tree a node belongs to: the ancestor with no parent. A
   * cycle of ancestors stops at the node that closes it.
   */
  public treeRoot(node: Node): Node {
    const visited = new Set<Node>([node]);
    let current = node;

    while (current.parent && !visited.has(current.parent)) {
      current = current.parent;
      visited.add(current);
    }

    return current;
  }

  /**
   * Whether a node sits left of the root of its own tree. A root has no side
   * and returns undefined.
   */
  public orientation(node: Node): boolean | undefined {
    if (!node.parent) return;

    return node.coordinates.x < this.treeRoot(node).coordinates.x;
  }

  /**
   * The node carrying the protection of `node`: the node itself or its
   * nearest protected ancestor. Null when the node is not protected.
   */
  public protectingNode(node: Node): Node | null {
    const visited = new Set<Node>();
    let current: Node | null = node;

    while (current && !visited.has(current)) {
      if (current.protected) return current;
      visited.add(current);
      current = current.parent;
    }
    return null;
  }
}
