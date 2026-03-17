import { Injectable, inject } from '@angular/core';
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
import { ExportNodeProperties } from '@mmp/map/types';
import { COLORS } from '../mmp/mmp-utils';

/**
 * Service responsible for importing mind maps from various formats.
 * Currently supports Mermaid mindmap syntax.
 */
@Injectable({
  providedIn: 'root',
})
export class ImportService {
  private readonly mmpService = inject(MmpService);
  private readonly toastrService = inject(ToastrService);
  private readonly utilsService = inject(UtilsService);
  private readonly settingsService = inject(SettingsService);

  constructor() {
    mermaidMindmapParser.yy = mindmapDb;
  }

  /**
   * Imports a mind map from Mermaid syntax.
   * Returns true if import was successful, false otherwise.
   */
  async importFromMermaid(input: string): Promise<boolean> {
    try {
      // Clear the mermaid database before parsing to prevent conflicts
      mindmapDb.clear();

      // Parse and validate the input first
      const parseResult = mermaidMindmapParser.parse(input);
      const parsedMermaidMindmap = parseResult.getMindmap();
      const convertedNodes = this.convertMermaidToNodes(parsedMermaidMindmap);

      // Validate that we have valid nodes before clearing the existing map
      if (!convertedNodes || convertedNodes.length === 0) {
        throw new Error('No valid nodes found in the imported data');
      }

      // Only clear existing map and import if data is valid
      this.mmpService.importMap(JSON.stringify(convertedNodes));

      const successMessage = await this.utilsService.translate(
        'TOASTS.MAP_IMPORT_SUCCESS'
      );
      this.toastrService.success(successMessage);
      return true;
    } catch (_error) {
      const errorMessage = await this.utilsService.translate(
        'TOASTS.ERRORS.IMPORT_ERROR'
      );
      this.toastrService.error(errorMessage);
      // Clear mermaid database on error to prevent stale data
      mindmapDb.clear();
      return false;
    }
  }

  /**
   * Converts a Mermaid mindmap node structure to the internal node format.
   */
  private convertMermaidToNodes(
    rootNode: MermaidMindmapNode
  ): ExportNodeProperties[] {
    const nodes: ExportNodeProperties[] = [];
    const siblingCountMap = new Map<string, number>();

    const processNode = (
      node: MermaidMindmapNode,
      parentId = '',
      isRoot = true,
      parentBranchColor = ''
    ): void => {
      const nodeId = uuidv4();
      const siblingIndex = this.getAndIncrementSiblingIndex(
        parentId,
        siblingCountMap
      );

      const branchColor = this.determineBranchColor(
        isRoot,
        parentId,
        parentBranchColor,
        nodes,
        siblingIndex
      );

      const convertedNode = this.createNode(
        nodeId,
        parentId,
        node,
        isRoot,
        branchColor
      );

      nodes.push(convertedNode);

      if (node.children?.length) {
        node.children.forEach(child => {
          processNode(child, nodeId, false, branchColor);
        });
      }
    };

    processNode(rootNode);
    return nodes;
  }

  /**
   * Gets the current sibling index and increments the counter for future siblings.
   * This ensures each sibling gets a unique index for branch color assignment.
   */
  private getAndIncrementSiblingIndex(
    parentId: string,
    siblingCountMap: Map<string, number>
  ): number {
    if (!parentId) {
      return 0;
    }

    const currentIndex = siblingCountMap.get(parentId) || 0;
    siblingCountMap.set(parentId, currentIndex + 1);
    return currentIndex;
  }

  /**
   * Determines the branch color for a node based on its position and settings.
   * Direct children of root get unique colors based on their sibling index.
   * Other nodes inherit their parent's branch color.
   */
  private determineBranchColor(
    isRoot: boolean,
    parentId: string,
    parentBranchColor: string,
    nodes: ExportNodeProperties[],
    siblingIndex: number
  ): string {
    if (isRoot) {
      return '';
    }

    const settings = this.settingsService.getCachedUserSettings();
    if (!settings) {
      return parentBranchColor;
    }

    const parentNode = nodes.find(n => n.id === parentId);
    const isDirectChildOfRoot = parentNode?.isRoot === true;

    if (isDirectChildOfRoot) {
      const { autoBranchColors, defaultNode } = settings.mapOptions;
      return this.getBranchColor(
        siblingIndex,
        '',
        autoBranchColors === true,
        defaultNode?.colors?.branch || ''
      );
    }

    return parentBranchColor;
  }

  /**
   * Get the branch color for a node based on settings and context.
   */
  private getBranchColor(
    childIndex: number,
    parentBranchColor: string,
    autoBranchColors: boolean,
    defaultBranchColor: string
  ): string {
    if (parentBranchColor) {
      // Inherit parent's branch color if auto colors are disabled
      return parentBranchColor;
    } else if (autoBranchColors) {
      // Assign color from the COLORS array based on child index
      return COLORS[childIndex % COLORS.length];
    } else {
      // Fall back to default
      return defaultBranchColor;
    }
  }

  /**
   * Creates a node structure with all required properties.
   */
  private createNode(
    nodeId: string,
    parentId: string,
    node: MermaidMindmapNode,
    isRoot: boolean,
    branchColor: string
  ): ExportNodeProperties {
    const settings = this.settingsService.getCachedUserSettings();
    if (!settings) {
      throw new Error('Settings not available');
    }

    const { defaultNode, rootNode } = settings.mapOptions;

    return {
      id: nodeId,
      parent: parentId,
      name: node.descr || node.nodeId || defaultNode.name,
      locked: !isRoot,
      isRoot,
      detached: false,
      hidden: false,
      font: {
        style: defaultNode.font.style,
        size: isRoot ? rootNode.font.size : defaultNode.font.size,
        weight: defaultNode.font.weight,
      },
      colors: {
        name: defaultNode.colors.name,
        background: defaultNode.colors.background,
        branch: branchColor,
      },
      k: 1,
      link: { href: '' },
      image: {
        src: '',
        size: isRoot ? rootNode.image.size : defaultNode.image.size,
      },
    };
  }
}
