import { Injectable } from '@angular/core';
import { MmpService } from '../mmp/mmp.service';
import { v4 as uuidv4 } from 'uuid';
import { ToastrService } from 'ngx-toastr';
import { UtilsService } from '../utils/utils.service';
import {
  MermaidMindmapNode,
  mermaidMindmapParser,
  mindmapDb,
} from '@teammapper/mermaid-mindmap-parser';
import { SettingsService } from '../settings/settings.service';

@Injectable({
  providedIn: 'root',
})
export class ImportService {
  constructor(
    public mmpService: MmpService,
    public toastrService: ToastrService,
    public utilsService: UtilsService,
    public settingsService: SettingsService
  ) {
    mermaidMindmapParser.yy = mindmapDb;
  }

  async importFromMermaid(input: string) {
    try {
      const parseResult = mermaidMindmapParser.parse(input);
      const parsedMermaidMindmap = parseResult.getMindmap();
      this.mmpService.importMap(
        JSON.stringify(await this.convertJsonStructure(parsedMermaidMindmap))
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

  private convertJsonStructure(inputData: MermaidMindmapNode) {
    const result = [];
    const processNode = (
      node: MermaidMindmapNode,
      parentId = '',
      isRoot = true
    ) => {
      const nodeId = uuidv4();
      const defaultSettings = this.settingsService.getCachedSettings();

      const convertedNode = {
        id: nodeId,
        parent: parentId,
        name:
          node.descr ||
          node.nodeId ||
          defaultSettings.mapOptions.defaultNode.name,
        locked: isRoot ? false : true,
        isRoot: isRoot,
        detached: false,
        hidden: false,
        font: {
          style: defaultSettings.mapOptions.defaultNode.font.style,
          size: isRoot
            ? defaultSettings.mapOptions.rootNode.font.size
            : defaultSettings.mapOptions.defaultNode.font.size,
          weight: defaultSettings.mapOptions.defaultNode.font.weight,
        },
        colors: {
          name: defaultSettings.mapOptions.defaultNode.colors.name,
          background: defaultSettings.mapOptions.defaultNode.colors.background,
          branch: isRoot
            ? ''
            : defaultSettings.mapOptions.defaultNode.colors.branch,
        },
        k: 1,
        link: { href: '' },
        image: {
          src: '',
          size: isRoot
            ? defaultSettings.mapOptions.rootNode.image.size
            : defaultSettings.mapOptions.defaultNode.image.size,
        },
      };

      result.push(convertedNode);

      // Process children recursively
      if (node.children && node.children.length > 0) {
        node.children.forEach(async child => {
          processNode(child, nodeId, false);
        });
      }
    };
    processNode(inputData);
    return result;
  }
}
