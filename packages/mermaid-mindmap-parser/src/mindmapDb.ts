import DOMPurify from 'dompurify';
import { D3Element, MindmapNode } from './types';

export const sanitizeText = (text: string): string => {
  return DOMPurify.sanitize(text, {
    FORBID_TAGS: ['style'],
  }).toString();
};

// https://github.com/mermaid-js/mermaid/blob/develop/packages/mermaid/src/diagrams/mindmap/mindmapDb.ts

let nodes: MindmapNode[] = [];
let cnt = 0;
let elements: Record<number, D3Element> = {};
// Indentation of the root, subtracted from every level so the root sits at 0
let baseLevel: number | undefined;

const clear = () => {
  nodes = [];
  cnt = 0;
  elements = {};
  baseLevel = undefined;
};

const getParent = function (level: number) {
  for (let i = nodes.length - 1; i >= 0; i--) {
    if (nodes[i].level < level) {
      return nodes[i];
    }
  }
  // No parent found
  return null;
};

const getMindmap = () => {
  return nodes.length > 0 ? nodes[0] : null;
};

const addNode = (level: number, id: string, descr: string, type: number) => {
  const isRoot = nodes.length === 0;
  if (isRoot) {
    baseLevel = level;
    level = 0;
  } else if (baseLevel !== undefined) {
    level -= baseLevel;
  }

  let padding = 10;
  switch (type) {
    case nodeType.ROUNDED_RECT:
    case nodeType.RECT:
    case nodeType.HEXAGON:
      padding *= 2;
  }

  const node = {
    id: cnt++,
    nodeId: sanitizeText(id),
    level,
    descr: sanitizeText(descr),
    type,
    children: [],
    width: 10,
    padding,
    isRoot,
  } satisfies MindmapNode;

  const parent = getParent(level);
  if (parent) {
    parent.children.push(node);
    // Keep all nodes in the list
    nodes.push(node);
  } else {
    if (isRoot) {
      nodes.push(node);
    } else {
      // Syntax error ... there can only bee one root
      throw new Error(
        'There can be only one root. No parent could be found for ("' +
          node.descr +
          '")'
      );
    }
  }
};

const nodeType = {
  DEFAULT: 0,
  NO_BORDER: 0,
  ROUNDED_RECT: 1,
  RECT: 2,
  CIRCLE: 3,
  CLOUD: 4,
  BANG: 5,
  HEXAGON: 6,
};

const getType = (startStr: string, endStr: string): number => {
  switch (startStr) {
    case '[':
      return nodeType.RECT;
    case '(':
      return endStr === ')' ? nodeType.ROUNDED_RECT : nodeType.CLOUD;
    case '((':
      return nodeType.CIRCLE;
    case ')':
      return nodeType.CLOUD;
    case '))':
      return nodeType.BANG;
    case '{{':
      return nodeType.HEXAGON;
    default:
      return nodeType.DEFAULT;
  }
};

const setElementForId = (id: number, element: D3Element) => {
  elements[id] = element;
};

const decorateNode = (decoration?: { class?: string; icon?: string }) => {
  if (!decoration) {
    return;
  }
  const node = nodes[nodes.length - 1];
  if (decoration.icon) {
    node.icon = sanitizeText(decoration.icon);
  }
  if (decoration.class) {
    node.class = sanitizeText(decoration.class);
  }
};

const type2Str = (type: number) => {
  switch (type) {
    case nodeType.DEFAULT:
      return 'no-border';
    case nodeType.RECT:
      return 'rect';
    case nodeType.ROUNDED_RECT:
      return 'rounded-rect';
    case nodeType.CIRCLE:
      return 'circle';
    case nodeType.CLOUD:
      return 'cloud';
    case nodeType.BANG:
      return 'bang';
    case nodeType.HEXAGON:
      return 'hexgon'; // cspell: disable-line
    default:
      return 'no-border';
  }
};

// Expose logger to grammar. Mermaid's own logger drops these calls at its
// default level, and console.trace would print a stack trace per token.
const noop = () => undefined;
const silentLogger = { trace: noop, debug: noop, info: noop };
const getLogger = () => silentLogger;
const getElementById = (id: number) => elements[id];

const db = {
  clear,
  addNode,
  getMindmap,
  nodeType,
  getType,
  setElementForId,
  decorateNode,
  type2Str,
  getLogger,
  getElementById,
} as const;

export default db;
