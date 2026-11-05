import * as v from 'valibot';
import { findMainRoot } from '../algorithms/tree';
import type { TreeNodeLike } from '../algorithms/tree';
import { ArrowSchema, CssColorSchema } from '../schemas';
import {
  arrowVerdicts,
  MapFileNodeIdSchema,
  MapFileNodeSchemas,
  readMapFileLayout,
  repairOrphanedNodes,
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

/**
 * Returns the allowed fields of a node attribute group from its schema, or
 * null for a plain value such as `name`. For `font` the fields are `size`,
 * `style` and `weight`. The function unwraps `v.optional` and `v.nullable`,
 * which store the group schema in `wrapped`. A field added to the schema needs
 * no change here.
 */
function objectEntries(schema: unknown): Record<string, unknown> | null {
  if (!isRecord(schema)) return null;
  if (isRecord(schema.wrapped)) return objectEntries(schema.wrapped);
  return isRecord(schema.entries) ? schema.entries : null;
}

/**
 * Warns about each field of `value` that `entries` does not name, and checks
 * the fields inside each attribute group, such as `font`, the same way.
 */
function checkFields(
  value: Record<string, unknown>,
  entries: Record<string, unknown>,
  path: string,
  findings: Findings
): void {
  for (const [key, field] of Object.entries(value)) {
    if (!Object.hasOwn(entries, key)) {
      findings.warn(
        `${path}.${key}`,
        'The file format has no such field; the import drops it.'
      );
      continue;
    }
    const groupEntries = objectEntries(entries[key]);
    if (groupEntries && isRecord(field)) {
      checkFields(field, groupEntries, `${path}.${key}`, findings);
    }
  }
}

/** Warns about unknown node fields, attribute groups included. */
function checkNodeFields(
  nodes: readonly FileNode[],
  version: MapFileVersion,
  findings: Findings
): void {
  const { entries } = MapFileNodeSchemas[version];
  for (const node of nodes) {
    checkFields(node.raw, entries, nodePath(node), findings);
  }
}

/** Warns about each node color the import replaces with the default color. */
function checkNodeColors(nodes: readonly FileNode[], findings: Findings): void {
  for (const node of nodes) {
    const colors = isRecord(node.raw.colors) ? node.raw.colors : {};
    for (const [key, color] of Object.entries(colors)) {
      if (color === undefined || v.is(CssColorSchema, color)) continue;
      findings.warn(
        `${nodePath(node)}.colors.${key}`,
        'The color is no hex color; the import uses the default color instead.'
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
 * Finds the main root with `findMainRoot`, which picks the same node as the
 * loader, and checks it. `nodes` come from the file, and `loaded` come from
 * the import's repair, which leaves at least one root node.
 */
function checkMainRoot(
  nodes: readonly FileNode[],
  loaded: readonly FileNode[],
  findings: Findings
): void {
  const marked = nodes.filter(node => node.isRoot);
  if (marked.length > 1) {
    const list = marked.map(nodePath).join(', ');
    findings.warn(
      'nodes',
      `${marked.length} nodes carry isRoot (${list}); a map has one main root.`
    );
  }
  const main = findMainRoot(loaded);
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

/** Returns why the import clears the parent of `node`. */
function brokenLinkCause(node: FileNode, ids: Set<string>): string {
  if (node.parent === node.id) return 'The node is its own parent';
  if (!ids.has(node.parent ?? '')) return `No node has the id "${node.parent}"`;
  return 'The node is part of a parent cycle';
}

/**
 * Warns about each orphaned node that needs a repair and returns the repaired
 * copies of all nodes. Running `repairOrphanedNodes` on copies makes the
 * warnings match the import. Nodes below a repaired node get no warning.
 */
function checkOrphans(
  nodes: readonly FileNode[],
  findings: Findings
): FileNode[] {
  const ids = new Set(nodes.map(node => node.id));
  const loaded = nodes.map(node => ({ ...node }));
  const repaired = new Set(repairOrphanedNodes(loaded));
  nodes
    .filter((_node, i) => repaired.has(loaded[i]))
    .sort((a, b) => a.index - b.index)
    .forEach(node => {
      findings.warn(
        `${nodePath(node)}.parent`,
        `${brokenLinkCause(node, ids)}; the import clears the parent, so the node starts a tree of its own.`
      );
    });
  return loaded;
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
  checkNodeColors(nodes, findings);
  const kept = checkUniqueIds(nodes, findings);
  const loaded = checkOrphans(kept, findings);
  checkMainRoot(kept, loaded, findings);
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
