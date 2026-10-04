import * as Y from 'yjs';
import {
  collectSubtreeIds,
  ExportNodeProperties,
  YJS_SECRET_SUBPROTOCOL_PREFIX,
  YJS_SUBPROTOCOL,
} from '@teammapper/shared';

/**
 * The Y.Doc's `nodes` map. Any peer with write access can store any value
 * under a key, so the type promises no Y.Map: read entries through `nodeAt`
 * and `nodeEntries`, which skip every other value.
 */
export type NodesMap = Y.Map<unknown>;

export function nodesMapOf(doc: Y.Doc): NodesMap {
  return doc.getMap('nodes');
}

/** The node stored under `id`, or undefined when the entry is no Y.Map. */
export function nodeAt<T>(
  nodesMap: Y.Map<T>,
  id: string
): Y.Map<unknown> | undefined {
  const entry = nodesMap.get(id);
  return entry instanceof Y.Map ? entry : undefined;
}

/** Every node of the map with its key, without the entries that are no Y.Map. */
export function nodeEntries<T>(nodesMap: Y.Map<T>): [string, Y.Map<unknown>][] {
  const entries: [string, Y.Map<unknown>][] = [];
  nodesMap.forEach((entry, id) => {
    if (entry instanceof Y.Map) entries.push([id, entry]);
  });
  return entries;
}

export type ClientColorMapping = Record<string, ClientColorMappingValue>;

export interface ClientColorMappingValue {
  nodeId: string;
  color: string;
}

/** The keys a node's Y.Map holds, one per node attribute. */
const NODE_KEYS = [
  'id',
  'parent',
  'k',
  'name',
  'isRoot',
  'protected',
  'coordinates',
  'colors',
  'font',
  'image',
  'link',
] as const satisfies readonly (keyof ExportNodeProperties)[];

/**
 * A node's attributes as its Y.Map stores them. A peer may write a value of
 * any type under any key, so every value is unknown until mmp's
 * `resolveNode` checks it.
 */
export type StoredNode = Partial<Record<(typeof NODE_KEYS)[number], unknown>>;

/**
 * Write every attribute of the node that is not undefined to its Y.Map. A
 * root's parent goes in as null, also when the caller passes ''.
 */
export function populateYMapFromNodeProps(
  yNode: Y.Map<unknown>,
  nodeProps: ExportNodeProperties
): void {
  for (const key of NODE_KEYS) {
    const value = key === 'parent' ? nodeProps.parent || null : nodeProps[key];
    if (value !== undefined) yNode.set(key, value);
  }
}

/**
 * The node as its Y.Map stores it. A key the Y.Map lacks stays absent, and
 * mmp's `resolveNode` fills it on read.
 */
export function yMapToNodeProps(yNode: Y.Map<unknown>): StoredNode {
  const record: StoredNode = {};
  for (const key of NODE_KEYS) {
    if (yNode.has(key)) record[key] = yNode.get(key);
  }
  return record;
}

export function buildYjsWsUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  const baseHref = document.querySelector('base')?.getAttribute('href') ?? '/';
  const path = baseHref.endsWith('/') ? baseHref : baseHref + '/';
  return `${protocol}//${host}${path}yjs`;
}

/**
 * Lists the subprotocols the Yjs WebSocket offers. The browser `WebSocket`
 * sends no custom header, and a URL would put the secret into access logs, so
 * the client offers the modification secret as a second subprotocol. Without a
 * secret the client offers `YJS_SUBPROTOCOL` alone.
 */
export function buildYjsProtocols(secret: string | null): string[] {
  return secret
    ? [YJS_SUBPROTOCOL, `${YJS_SECRET_SUBPROTOCOL_PREFIX}${secret}`]
    : [YJS_SUBPROTOCOL];
}

// RFC 7230 token characters, the set RFC 6455 requires of a subprotocol.
const TOKEN_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

/**
 * Returns the secret when it consists of token characters only, and an empty
 * string otherwise. The secret comes from the URL fragment, and the browser
 * throws on a subprotocol with a non-token character and on a header value
 * above U+00FF. A dropped secret opens the map read-only.
 */
export function toTransmittableSecret(secret: string | null): string {
  return secret && TOKEN_PATTERN.test(secret) ? secret : '';
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

// Collects all descendant node IDs using the shared cycle-safe BFS algorithm.
export function collectDescendantIds<T>(
  nodesMap: Y.Map<T>,
  nodeId: string
): string[] {
  const nodes = nodeEntries(nodesMap).map(([id, yNode]) => ({
    id,
    parent: (yNode.get('parent') as string | null) ?? null,
  }));

  return collectSubtreeIds(nodes, nodeId);
}
