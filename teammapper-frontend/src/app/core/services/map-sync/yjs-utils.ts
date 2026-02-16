import * as Y from 'yjs';
import { ExportNodeProperties } from '@mmp/map/types';
import { ReversePropertyMapping } from './server-types';

const MESSAGE_WRITE_ACCESS = 4;

export type ClientColorMapping = Record<string, ClientColorMappingValue>;

export interface ClientColorMappingValue {
  nodeId: string;
  color: string;
}

export function populateYMapFromNodeProps(
  yNode: Y.Map<unknown>,
  nodeProps: ExportNodeProperties
): void {
  yNode.set('id', nodeProps.id);
  yNode.set('parent', nodeProps.parent ?? null);
  yNode.set('name', nodeProps.name ?? '');
  yNode.set('isRoot', nodeProps.isRoot ?? false);
  yNode.set('locked', nodeProps.locked ?? false);
  yNode.set('detached', nodeProps.detached ?? false);
  yNode.set('k', nodeProps.k ?? 1);
  yNode.set('coordinates', nodeProps.coordinates ?? { x: 0, y: 0 });
  yNode.set(
    'colors',
    nodeProps.colors ?? { name: '', background: '', branch: '' }
  );
  yNode.set('font', nodeProps.font ?? { size: 12, style: '', weight: '' });
  yNode.set('image', nodeProps.image ?? { src: '', size: 0 });
  yNode.set('link', nodeProps.link ?? { href: '' });
}

export function yMapToNodeProps(yNode: Y.Map<unknown>): ExportNodeProperties {
  return {
    id: yNode.get('id') as string,
    parent: (yNode.get('parent') as string) ?? null,
    k: (yNode.get('k') as number) ?? 1,
    name: (yNode.get('name') as string) ?? '',
    isRoot: (yNode.get('isRoot') as boolean) ?? false,
    locked: (yNode.get('locked') as boolean) ?? false,
    detached: (yNode.get('detached') as boolean) ?? false,
    coordinates: (yNode.get('coordinates') as { x: number; y: number }) ?? {
      x: 0,
      y: 0,
    },
    colors: (yNode.get('colors') as ExportNodeProperties['colors']) ?? {
      name: '',
      background: '',
      branch: '',
    },
    font: (yNode.get('font') as ExportNodeProperties['font']) ?? {
      size: 12,
      style: '',
      weight: '',
    },
    image: (yNode.get('image') as ExportNodeProperties['image']) ?? {
      src: '',
      size: 0,
    },
    link: (yNode.get('link') as ExportNodeProperties['link']) ?? {
      href: '',
    },
  };
}

export function buildYjsWsUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  const baseHref = document.querySelector('base')?.getAttribute('href') ?? '/';
  const path = baseHref.endsWith('/') ? baseHref : baseHref + '/';
  return `${protocol}//${host}${path}yjs`;
}

// Returns true for writable, false for read-only, null if not a write-access message
export function parseWriteAccessBytes(data: Uint8Array): boolean | null {
  if (data.length >= 2 && data[0] === MESSAGE_WRITE_ACCESS) {
    return data[1] === 1;
  }
  return null;
}

export function resolveClientColor(
  currentColor: string,
  usedColors: Set<string>
): string {
  if (!usedColors.has(currentColor)) return currentColor;

  return (
    '#' +
    Math.floor(Math.random() * 16777215)
      .toString(16)
      .padStart(6, '0')
  );
}

export function findAffectedNodes(
  oldMapping: ClientColorMapping,
  newMapping: ClientColorMapping
): Set<string> {
  const nodes = new Set<string>();
  for (const value of Object.values(oldMapping)) {
    if (value.nodeId) nodes.add(value.nodeId);
  }
  for (const value of Object.values(newMapping)) {
    if (value.nodeId) nodes.add(value.nodeId);
  }
  return nodes;
}

export interface MmpPropertyUpdate {
  prop: string;
  val: unknown;
}

export function resolveMmpPropertyUpdate(
  yjsKey: string,
  value: unknown
): MmpPropertyUpdate[] {
  const mapping =
    ReversePropertyMapping[yjsKey as keyof typeof ReversePropertyMapping];
  if (!mapping) return [];

  if (typeof mapping === 'string') {
    return [{ prop: mapping, val: value }];
  }

  return resolveCompoundMmpUpdates(
    mapping as Record<string, string>,
    value as Record<string, unknown>
  );
}

// Groups non-root nodes by their parent ID
const groupByParent = (
  nodes: readonly ExportNodeProperties[]
): ReadonlyMap<string, readonly ExportNodeProperties[]> =>
  nodes
    .filter(n => !n.isRoot)
    .reduce((acc, node) => {
      const pid = node.parent ?? '';
      acc.set(pid, [...(acc.get(pid) ?? []), node]);
      return acc;
    }, new Map<string, ExportNodeProperties[]>());

// Recursive BFS: processes head of queue, enqueues its children, accumulates result
const collectBreadthFirst = (
  queue: readonly ExportNodeProperties[],
  childrenOf: ReadonlyMap<string, readonly ExportNodeProperties[]>,
  collected: readonly ExportNodeProperties[] = []
): readonly ExportNodeProperties[] => {
  if (queue.length === 0) return collected;
  const [current, ...rest] = queue;
  const kids = childrenOf.get(current.id) ?? [];
  return collectBreadthFirst([...rest, ...kids], childrenOf, [
    ...collected,
    current,
  ]);
};

// Appends nodes not reachable from root to prevent data loss
const appendOrphans = (
  ordered: readonly ExportNodeProperties[],
  all: readonly ExportNodeProperties[]
): ExportNodeProperties[] => {
  const visited = new Set(ordered.map(n => n.id));
  return [...ordered, ...all.filter(n => !visited.has(n.id))];
};

// Sorts nodes so root comes first and parents always precede their children (BFS order).
// Orphaned nodes (not reachable from root) are appended at the end to prevent data loss.
export const sortParentFirst = (
  nodes: readonly ExportNodeProperties[]
): ExportNodeProperties[] => {
  const root = nodes.find(n => n.isRoot);
  if (!root) return [...nodes];

  const childrenOf = groupByParent(nodes);
  const ordered = collectBreadthFirst([root], childrenOf);
  return appendOrphans(ordered, nodes);
};

export function resolveCompoundMmpUpdates(
  mapping: Record<string, string>,
  value: Record<string, unknown>
): MmpPropertyUpdate[] {
  if (!value) return [];
  const updates: MmpPropertyUpdate[] = [];
  for (const [subKey, mmpProp] of Object.entries(mapping)) {
    if (subKey in value) {
      updates.push({ prop: mmpProp, val: value[subKey] });
    }
  }
  return updates;
}
