import { Injectable } from '@angular/core';
import { MmpService } from '../mmp/mmp.service';
import { v4 as uuidv4 } from 'uuid';
import { ToastrService } from 'ngx-toastr';
import { UtilsService } from '../utils/utils.service';
import {
  MermaidMindmapNode,
  mermaidMindmapParser,
  mindmapDb,
} from 'packages/mermaid-mindmap-parser';

@Injectable({
  providedIn: 'root',
})
export class ImportService {
  constructor(
    public mmpService: MmpService,
    public toastrService: ToastrService,
    public utilsService: UtilsService
  ) {
    mermaidMindmapParser.yy = mindmapDb;
  }

  async importFromMermaid(input: string) {
    try {
      const parseResult = mermaidMindmapParser.parse(input);
      const parsedMermaidMindmap = parseResult.getMindmap();
      this.mmpService.importMap(
        JSON.stringify(this.convertJsonStructure(parsedMermaidMindmap))
      );
      mindmapDb.clear();
      const msg = await this.utilsService.translate(
        'TOASTS.MAP_IMPORT_SUCCESS'
      );
      this.toastrService.success(msg);
    } catch (_error) {
      const msg = await this.utilsService.translate(
        'TOASTS.ERRORS.IMPORT_ERROR'
      );
      this.toastrService.error(msg);
      return;
    }
  }

  convertJsonStructure(inputData: MermaidMindmapNode) {
    const result = [];
    const processNode = (
      node: MermaidMindmapNode,
      parentId = '',
      isRoot = true
    ) => {
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
        k: 1,
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
