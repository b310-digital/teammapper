import type { NodeProperty } from '@teammapper/shared';
import type Node from '../models/node.js';

/**
 * What the node change path tells the view. The model already holds the new
 * value when the view hears of it.
 */
export interface NodeView {
  /** Draw the property of the node as its model holds it. */
  renderNodeProperty(node: Node, property: NodeProperty): void;
}
