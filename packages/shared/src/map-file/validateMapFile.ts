import * as v from 'valibot';
import { findMainRoot, sortNodesParentFirst } from '../algorithms/tree';
import type { TreeNodeLike } from '../algorithms/tree';
import { ArrowSchema } from '../schemas';
import {
  arrowVerdicts,
  MapFileNodeIdSchema,
  MapFileNodeSchemas,
  readMapFileLayout,
} from './mapFile';
import { isRecord } from './isRecord';
import type {
  ImportedArrowRefusal,
  MapFileLayout,
  MapFileVersion,
} from './mapFile';

/**
 * One problem in a map file. An error makes the import fail or leaves the
 * imported map broken. A warning marks data the import accepts but changes
 * or drops.
 */
export interface MapFileFinding {
  severity: 'error' | 'warning';
  /** Where the problem is, such as `nodes[3].colors.background`. */
  path: string;
  reason: string;
}

/** The result of `validateMapFile`. */
export interface MapFileReport {
  /** The map file version the import reads the file as, null when none. */
  version: MapFileVersion | null;
  /** False when the file has no version field, so the import reads the version from the layout. */
  versionDeclared: boolean;
  findings: MapFileFinding[];
}

/** A node the tree checks can read, with its position in the file. */
interface FileNode extends TreeNodeLike {
  index: number;
  parent: string | null;
  isRoot: boolean;
  raw: Record<string, unknown>;
}

const ARROW_REASONS: Record<ImportedArrowRefusal, string> = {
  invalid: 'the entry is no object with a source and a target id',
  self: 'the arrow starts and ends at the same node',
  missing: 'the source or the target names no node in the file',
  parent: 'the arrow joins a node to its parent, which a branch already does',
  duplicate: 'an earlier arrow already joins the same source and target',
};

/** Collects findings in the order the checks record them. */
class Findings {
  readonly list: MapFileFinding[] = [];

  error(path: string, reason: string): void {
    this.list.push({ severity: 'error', path, reason });
  }

  warn(path: string, reason: string): void {
    this.list.push({ severity: 'warning', path, reason });
  }
}

/** Writes a valibot issue path as `nodes[3].colors.background`. */
function issuePath(prefix: string, issue: v.BaseIssue<unknown>): string {
  return (issue.path ?? []).reduce(
    (path, item) =>
      typeof item.key === 'number'
        ? `${path}[${item.key}]`
        : `${path}.${String(item.key)}`,
    prefix
  );
}

const nodePath = (node: FileNode) => `nodes[${node.index}]`;

/** Parses the text, or records why it holds no valid JSON. */
function parseJson(
  text: string,
  findings: Findings
): { value: unknown } | null {
  try {
    return { value: JSON.parse(text) };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    findings.error('file', `The file holds no valid JSON: ${reason}`);
    return null;
  }
}

/** Reads the layout the import accepts, warning about what it ignores. */
function checkLayout(
  parsed: unknown,
  findings: Findings
): MapFileLayout | null {
  const result = readMapFileLayout(parsed);
  if (!result.ok) {
    findings.error(result.path, result.reason);
    return null;
  }
  const { layout } = result;
  for (const field of layout.ignoredFields) {
    findings.warn(field, 'The import ignores this field.');
  }
  if (layout.arrowsIgnored) {
    findings.warn(
      'arrows',
      'The field holds no list, so the map imports with no arrows.'
    );
  }
  return layout;
}

/**
 * Records every issue the node schema of the file's version and the id rule
 * find in a node. Returns whether the node passes.
 */
function checkNode(
  node: unknown,
  path: string,
  version: MapFileVersion,
  findings: Findings
): boolean {
  const result = v.safeParse(MapFileNodeSchemas[version], node);
  for (const issue of result.issues ?? []) {
    findings.error(issuePath(path, issue), issue.message);
  }
  // The schema already reports an id that is no string.
  const id = isRecord(node) ? node.id : undefined;
  const idValid = typeof id !== 'string' || v.is(MapFileNodeIdSchema, id);
  if (!idValid) findings.error(`${path}.id`, `The id "${id}" is no UUID.`);
  return result.success && idValid;
}

/** Checks every node of the file. Returns whether all nodes pass. */
function checkNodeSchemas(layout: MapFileLayout, findings: Findings): boolean {
  const { nodes, version } = layout;
  if (nodes.length === 0) {
    findings.error(
      'nodes',
      'The node list is empty; the import changes nothing.'
    );
  }
  const failures = nodes.filter(
    (node, index) => !checkNode(node, `nodes[${index}]`, version, findings)
  ).length;
  if (failures > 0) {
    findings.error(
      'nodes',
      `${failures} of ${nodes.length} nodes fail the version ${version} rules, so the import rejects the whole file.`
    );
  }
  return failures === 0;
}

/**
 * The nodes the tree checks read: objects with a string id. A node that fails
 * the schema still takes part, so its child nodes do not show up as orphaned
 * nodes. The parent reads as the loader stores it, an empty one as null.
 */
function fileNodes(nodes: readonly unknown[]): FileNode[] {
  return nodes.flatMap((raw, index) => {
    if (!isRecord(raw) || typeof raw.id !== 'string') return [];
    const parent =
      typeof raw.parent === 'string' && raw.parent ? raw.parent : null;
    return [{ index, id: raw.id, parent, isRoot: raw.isRoot === true, raw }];
  });
}

/** Warns about node fields the import drops. */
function checkNodeFields(
  nodes: readonly FileNode[],
  version: MapFileVersion,
  findings: Findings
): void {
  const fields = new Set(Object.keys(MapFileNodeSchemas[version].entries));
  for (const node of nodes) {
    for (const key of Object.keys(node.raw).filter(k => !fields.has(k))) {
      findings.warn(
        `${nodePath(node)}.${key}`,
        'The node has no such field; the import drops it.'
      );
    }
  }
}

/**
 * Records nodes that share an id, and returns the nodes the map keeps: the
 * map data stores one node per id, so a later node replaces an earlier one.
 */
function checkUniqueIds(
  nodes: readonly FileNode[],
  findings: Findings
): FileNode[] {
  const kept = new Map<string, FileNode>();
  for (const node of nodes) {
    const earlier = kept.get(node.id);
    if (earlier) {
      findings.error(
        `${nodePath(node)}.id`,
        `The id "${node.id}" repeats the id of ${nodePath(earlier)}; the map keeps only this later node.`
      );
    }
    kept.set(node.id, node);
  }
  return [...kept.values()];
}

/**
 * Checks the main root of the map the loader builds. `findMainRoot` picks the
 * same node as the loader's `withMainRoot`: the first node with `isRoot`, else
 * the first root node.
 */
function checkMainRoot(nodes: FileNode[], findings: Findings): void {
  const marked = nodes.filter(node => node.isRoot);
  if (marked.length > 1) {
    const list = marked.map(nodePath).join(', ');
    findings.warn(
      'nodes',
      `${marked.length} nodes carry isRoot (${list}); a map has one main root.`
    );
  }
  if (nodes.length > 0 && nodes.every(node => node.parent !== null)) {
    findings.error(
      'nodes',
      'Every node has a parent, so the map has no root node and no tree to draw.'
    );
    return;
  }
  const main = findMainRoot(nodes);
  if (main && marked.length === 0) {
    findings.warn(
      'nodes',
      `No node carries isRoot; the import makes ${nodePath(main)} the main root.`
    );
  }
  if (main && main.parent !== null) {
    findings.error(
      `${nodePath(main)}.isRoot`,
      'The main root has a parent, so the map has no main root that starts a tree.'
    );
  }
}

/**
 * The ancestors of the node, parent first. The walk stops at a missing parent
 * or at the first node it reaches twice, so a parent cycle ends it.
 */
function ancestors(node: FileNode, byId: Map<string, FileNode>): FileNode[] {
  const found: FileNode[] = [];
  const seen = new Set<string>();
  let current = byId.get(node.parent ?? '');
  while (current && !seen.has(current.id)) {
    found.push(current);
    seen.add(current.id);
    current = byId.get(current.parent ?? '');
  }
  return found;
}

/** Whether following the parents from the node leads back to it. */
const inCycle = (node: FileNode, byId: Map<string, FileNode>): boolean =>
  ancestors(node, byId).some(ancestor => ancestor.id === node.id);

/**
 * The reason no root node reaches an orphaned node, or null when the node
 * only descends from another orphaned node.
 */
function orphanCause(
  node: FileNode,
  byId: Map<string, FileNode>
): string | null {
  if (node.parent === node.id) return 'The node names itself as parent';
  if (!byId.has(node.parent ?? ''))
    return `No node has the id "${node.parent}"`;
  if (inCycle(node, byId)) return 'The node is part of a parent cycle';
  return null;
}

/** The nearest ancestor of the node that carries an orphan cause. */
const orphanAncestor = (
  node: FileNode,
  byId: Map<string, FileNode>
): FileNode | undefined =>
  ancestors(node, byId).find(ancestor => orphanCause(ancestor, byId) !== null);

/**
 * Warns about each orphaned node `sortNodesParentFirst` returns as unreached,
 * and names its cause or the orphaned ancestor above it. The import keeps
 * orphaned nodes; the backend drops them when it saves the map.
 */
function checkOrphans(nodes: readonly FileNode[], findings: Findings): void {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const suffix =
    'no root node reaches it, and the server drops it when it saves the map.';
  for (const node of sortNodesParentFirst(nodes).unreached) {
    const cause = orphanCause(node, byId);
    const ancestor = cause === null ? orphanAncestor(node, byId) : undefined;
    const reason =
      cause ??
      `The node descends from the orphaned node ${ancestor ? nodePath(ancestor) : 'above it'}`;
    findings.warn(`${nodePath(node)}.parent`, `${reason}; ${suffix}`);
  }
}

/** Warns about each arrow entry the import drops, with the reason. */
function checkArrows(
  arrows: readonly unknown[],
  nodes: readonly FileNode[],
  findings: Findings
): void {
  arrowVerdicts(nodes, arrows).forEach((refusal, index) => {
    if (refusal === null) return;
    const path = `arrows[${index}]`;
    findings.warn(
      path,
      `The import drops the arrow: ${ARROW_REASONS[refusal]}.`
    );
    for (const issue of v.safeParse(ArrowSchema, arrows[index]).issues ?? []) {
      findings.warn(issuePath(path, issue), issue.message);
    }
  });
}

/** Runs the node, tree and arrow checks on a file the layout accepts. */
function checkMap(layout: MapFileLayout, findings: Findings): void {
  const allValid = checkNodeSchemas(layout, findings);
  const nodes = fileNodes(layout.nodes);
  checkNodeFields(nodes, layout.version, findings);
  const kept = checkUniqueIds(nodes, findings);
  checkMainRoot(kept, findings);
  checkOrphans(kept, findings);
  // The loader checks arrows against every node, repeated ids included.
  if (allValid) checkArrows(layout.arrows, nodes, findings);
}

/**
 * Checks the text of a JSON file against the rules the TeamMapper import
 * applies for the file's map file version, and returns that version with
 * every error and warning, each with its reason.
 */
export function validateMapFile(text: string): MapFileReport {
  const findings = new Findings();
  const parsed = parseJson(text, findings);
  const layout = parsed && checkLayout(parsed.value, findings);
  if (!layout) {
    return { version: null, versionDeclared: false, findings: findings.list };
  }
  checkMap(layout, findings);
  const { version, versionDeclared } = layout;
  return { version, versionDeclared, findings: findings.list };
}
