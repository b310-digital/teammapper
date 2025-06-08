import { parser as mermaidMindmapParser } from './mindmap.js';
import mindmapDB, { MindmapNode } from './mindmapDb.js';

mermaidMindmapParser.yy = mindmapDB;
export { mermaidMindmapParser, MindmapNode as MermaidMindmapNode };
