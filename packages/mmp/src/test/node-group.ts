import * as d3 from 'd3';

/**
 * The group the renderer drew for the node `id`. The renderer binds each node
 * id to its group as the d3 datum and sets no id attribute, so the lookup
 * filters on the datum. Throws when no group shows the node.
 */
export function nodeGroup(id: string): SVGGElement {
  const group = d3
    .selectAll<SVGGElement, string>('g.node')
    .filter(datum => datum === id)
    .node();
  if (!group) throw new Error('no group for ' + id);
  return group;
}
