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
import { ExportNodeProperties } from '@teammapper/shared';
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
      // Parse and validate every block before replacing the existing map
      const convertedNodes = this.splitMermaidBlocks(input).flatMap(
        (block, index) => this.parseBlock(block, index === 0)
      );

      if (convertedNodes.length === 0) {
        throw new Error('No valid nodes found in the imported data');
      }

      // One importMap call, since each call replaces the whole map
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
   * Splits the Mermaid text into one string per `mindmap` block, since the
   * parser accepts a single root per parse. Lines before the first `mindmap`
   * line stay with the first block. The header match ignores case, as the
   * Mermaid lexer does.
   */
  private splitMermaidBlocks(input: string): string[] {
    const blocks: string[][] = [[]];
    let blockHasHeader = false;
    for (const line of input.split('\n')) {
      const isHeader = /^\s*mindmap\s*$/i.test(line);
      if (isHeader && blockHasHeader) blocks.push([]);
      blockHasHeader ||= isHeader;
      blocks[blocks.length - 1].push(line);
    }
    return blocks.map(lines => lines.join('\n'));
  }

  /**
   * Parses one `mindmap` block into nodes. Only the main tree's root carries
   * the `isRoot` mark.
   */
  private parseBlock(
    block: string,
    isMainTree: boolean
  ): ExportNodeProperties[] {
    // Clear the mermaid database before parsing to prevent conflicts
    mindmapDb.clear();
    const rootNode = mermaidMindmapParser.parse(block).getMindmap();
    if (!rootNode) {
      throw new Error('A mindmap block holds no node');
    }
    return this.convertMermaidToNodes(rootNode, isMainTree);
  }

  /**
   * Converts a Mermaid mindmap node structure to the internal node format.
   */
  private convertMermaidToNodes(
    rootNode: MermaidMindmapNode,
    isMainTree: boolean
  ): ExportNodeProperties[] {
    const nodes: ExportNodeProperties[] = [];
    const siblingCountMap = new Map<string, number>();

    const processNode = (
      node: MermaidMindmapNode,
      parentId = '',
      parentBranchColor = ''
    ): void => {
      const nodeId = uuidv4();
      const siblingIndex = this.getAndIncrementSiblingIndex(
        parentId,
        siblingCountMap
      );

      const branchColor = this.determineBranchColor(
        parentId,
        parentBranchColor,
        nodes,
        siblingIndex
      );

      const isRoot = isMainTree && parentId === '';
      nodes.push(this.createNode(nodeId, parentId, node, isRoot, branchColor));

      node.children?.forEach(child => {
        processNode(child, nodeId, branchColor);
      });
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
   * Returns the branch color for a node, by its position and the settings:
   * - a root: no branch color
   * - a direct child of a root: a unique color picked by its sibling index
   * - any other node: its parent's branch color
   */
  private determineBranchColor(
    parentId: string,
    parentBranchColor: string,
    nodes: ExportNodeProperties[],
    siblingIndex: number
  ): string {
    if (parentId === '') {
      return '';
    }

    const settings = this.settingsService.getCachedUserSettings();
    if (!settings) {
      return parentBranchColor;
    }

    const parentNode = nodes.find(n => n.id === parentId);
    const isDirectChildOfRoot = parentNode?.parent === '';

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
