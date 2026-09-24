// An opaque handle onto whatever the renderer drew for a node. This package
// only stores it and hands it back, so it never needs a shape.
type D3Element = unknown;

// https://github.com/mermaid-js/mermaid/blob/develop/packages/mermaid/src/diagrams/mindmap/mindmapTypes.ts
interface MindmapNode {
  id: number;
  nodeId: string;
  level: number;
  descr: string;
  type: number;
  children: MindmapNode[];
  width: number;
  padding: number;
  section?: number;
  height?: number;
  class?: string;
  icon?: string;
  x?: number;
  y?: number;
}

export type { D3Element, MindmapNode };
