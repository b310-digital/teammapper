import type { ArrowRefusal, MapArrow } from '../models';
import type { TreeNodeLike } from './tree';

/** The key of an arrow in the Y.Doc `arrows` map and in `mmp_arrow`. */
export function arrowKey(source: string, target: string): string {
  return `${source}:${target}`;
}

/**
 * Checks the endpoint rules for a new arrow. Returns the reason for a refusal,
 * or null when the map may hold an arrow from `source` to `target`. The rules
 * apply when an arrow is created or imported, not to one that already exists.
 */
export function canConnect(
  nodes: readonly TreeNodeLike[],
  arrows: readonly MapArrow[],
  source: string,
  target: string
): ArrowRefusal | null {
  if (source === target) return 'self';
  const sourceNode = nodes.find(n => n.id === source);
  const targetNode = nodes.find(n => n.id === target);
  if (!sourceNode || !targetNode) return 'missing';
  if (sourceNode.parent === target || targetNode.parent === source) {
    return 'parent';
  }
  const key = arrowKey(source, target);
  if (arrows.some(a => arrowKey(a.source, a.target) === key)) {
    return 'duplicate';
  }
  return null;
}

/** Returns the arrows whose source and target both lie in `nodeIds`. */
export function selectArrowsWithin(
  arrows: readonly MapArrow[],
  nodeIds: ReadonlySet<string>
): MapArrow[] {
  return arrows.filter(a => nodeIds.has(a.source) && nodeIds.has(a.target));
}
