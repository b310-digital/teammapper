import { Injectable } from '@angular/core';
import mermaid from 'mermaid';
import { MmpService } from '../mmp/mmp.service';
import { v4 as uuidv4 } from 'uuid';
import { parser as mermaidMindmapParser } from './mindmap.js';
import mindmapDB from './mindmapDb.js';

@Injectable({
  providedIn: 'root',
})
export class ImportService {
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  constructor(public mmpService: MmpService,) {}

  async importFromMermaid(input: string) {
    mermaidMindmapParser.yy = mindmapDB;
    console.log(
      mermaidMindmapParser.parse(`mindmap
      TEST
    `).getMindmap());
    // mermaid.initialize({});
    // // Parse the diagram
    // const diagram = await mermaid.mermaidAPI.getDiagramFromText(
    //   `mindmap
    //     TEST
    //       BLUB hier
    //       Hallo
    //       Haus
    //         Bär
    //   `
    // );
    // console.log(diagram.parser);
    // //@ts-ignore
    // const mermaidParser = diagram.parser.yy;
    // const mindmap = mermaidParser.getMindmap();
    // console.log(JSON.stringify(mindmap));

    // console.log(JSON.stringify(this.convertJsonStructure(mindmap)))

    // this.mmpService.importMap(
    //   JSON.stringify(this.convertJsonStructure(mindmap))
    // );
  }

  // convertJsonStructure(inputData: any) {
  // const result = [];
  // const processNode = (node, parentId = "", isRoot = true) => {
  //   const nodeId = uuidv4();
    
  //   // Create the converted node
  //   const convertedNode = {
  //     id: nodeId,
  //     parent: parentId,
  //     name: node.descr || node.nodeId || "Unnamed",
  //     locked: isRoot ? false : true,
  //     isRoot: isRoot,
  //     detached: false,
  //     hidden: false,
  //     font: {
  //       style: "normal",
  //       size: isRoot ? 26 : 22,
  //       weight: "normal"
  //     },
  //     colors: {
  //       name: "#666666",
  //       background: "#f5f5f5",
  //       branch: isRoot ? "" : "#FFC107"
  //     },
  //     k: isRoot ? 1 : Math.random() * 10,
  //     link: { href: "" },
  //     image: { src: "", size: isRoot ? 70 : 60 },
  //   };
    
  //   result.push(convertedNode);
    
  //   // Process children recursively
  //   if (node.children && node.children.length > 0) {
  //     node.children.forEach(child => {
  //       processNode(child, nodeId, false);
  //     });
  //   }
  // }
  // processNode(inputData);
  // return result;
  // }
}
