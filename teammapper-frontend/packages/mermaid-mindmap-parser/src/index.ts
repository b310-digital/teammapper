// @ts-expect-error No types available for JISON
import { parser as mermaidMindmapParser } from './parser/mindmap.jison';
import mindmapDB from './mindmapDb';
import { MindmapNode } from './types';

mermaidMindmapParser.yy = mindmapDB;
export { mermaidMindmapParser, type MindmapNode as MermaidMindmapNode };
