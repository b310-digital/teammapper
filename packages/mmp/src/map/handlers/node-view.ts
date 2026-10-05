import type { NodeProperty } from '@teammapper/shared';

/**
 * What the node change path tells the view. The model already holds the new
 * value when the view hears of it.
 */
export interface NodeView {
  /** Draw the property of the node with `id` as its model holds it. */
  renderNodeProperty(id: string, property: NodeProperty): void;
}
