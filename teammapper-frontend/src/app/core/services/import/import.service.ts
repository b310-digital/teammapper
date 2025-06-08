import { Injectable } from '@angular/core';
import { MmpService } from '../mmp/mmp.service';
import { v4 as uuidv4 } from 'uuid';
import {
  MermaidMindmapNode,
  mermaidMindmapParser,
} from '@mermaid-mindmap-parser';

@Injectable({
  providedIn: 'root',
})
export class ImportService {
  constructor(public mmpService: MmpService) {}

  async importFromMermaid(input: string) {
    console.log(input);
    const parsedMermaidMindmap = mermaidMindmapParser.parse(input).getMindmap();
    console.log(parsedMermaidMindmap);
    this.mmpService.importMap(
      JSON.stringify(this.convertJsonStructure(parsedMermaidMindmap))
    );
  }

  convertJsonStructure(inputData: MermaidMindmapNode) {
    const result = [];
    const processNode = (node, parentId = '', isRoot = true) => {
      const nodeId = uuidv4();

      // Create the converted node
      const convertedNode = {
        id: nodeId,
        parent: parentId,
        name: node.descr || node.nodeId || 'Unnamed',
        locked: isRoot ? false : true,
        isRoot: isRoot,
        detached: false,
        hidden: false,
        font: {
          style: 'normal',
          size: isRoot ? 26 : 22,
          weight: 'normal',
        },
        colors: {
          name: '#666666',
          background: '#f5f5f5',
          branch: isRoot ? '' : '#FFC107',
        },
        k: isRoot ? 1 : Math.random() * 10,
        link: { href: '' },
        image: { src: '', size: isRoot ? 70 : 60 },
      };

      result.push(convertedNode);

      // Process children recursively
      if (node.children && node.children.length > 0) {
        node.children.forEach(child => {
          processNode(child, nodeId, false);
        });
      }
    };
    processNode(inputData);
    return result;
  }
}
