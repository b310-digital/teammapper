import { Injectable } from '@angular/core';
import { ExportNodeProperties } from '@mmp/map/types';

@Injectable({
  providedIn: 'root',
})
export class ExportService {
  /**
   * Convert mind map data to Mermaid syntax using functional programming approach
   */
  public exportToMermaid(nodes: ExportNodeProperties[]): string {
    if (!nodes || nodes.length === 0) {
      return 'mindmap\n  root';
    }

    const rootNode = nodes.find(node => node.isRoot);
    if (!rootNode) {
      return 'mindmap\n  root';
    }

    // Create a map for quick parent-child lookups
    const childrenMap = this.createChildrenMap(nodes);

    // Build the mermaid syntax starting from root
    const mermaidLines = [
      'mindmap',
      this.buildNodeTree(rootNode, childrenMap, 1),
    ];

    return mermaidLines.join('\n');
  }

  /**
   * Create a map of parent IDs to their children for efficient lookup
   * Only includes nodes that are not detached (connected to the root)
   */
  private createChildrenMap(
    nodes: ExportNodeProperties[]
  ): Map<string, ExportNodeProperties[]> {
    return nodes.reduce((map, node) => {
      // Skip detached nodes (not connected to root)
      if (node.detached) {
        return map;
      }

      if (node.parent) {
        const siblings = map.get(node.parent) || [];
        map.set(node.parent, [...siblings, node]);
      }
      return map;
    }, new Map<string, ExportNodeProperties[]>());
  }

  /**
   * Recursively build the node tree in Mermaid syntax
   */
  private buildNodeTree(
    node: ExportNodeProperties,
    childrenMap: Map<string, ExportNodeProperties[]>,
    level: number
  ): string {
    const indent = '  '.repeat(level);
    const nodeText = this.formatNodeText(node);
    const nodeLine =
      level === 1
        ? `${indent}${nodeText}`
        : `${indent}${this.wrapWithBrackets(nodeText, node)}`;

    const children = childrenMap.get(node.id) || [];
    const childLines = children
      .map(child => this.buildNodeTree(child, childrenMap, level + 1))
      .join('\n');

    return childLines ? `${nodeLine}\n${childLines}` : nodeLine;
  }

  /**
   * Format node text, escaping special characters and adding links if present
   */
  private formatNodeText(node: ExportNodeProperties): string {
    let text = node.name || 'Untitled';

    // If node has a link, wrap text in markdown link syntax
    if (node.link?.href) {
      text = `[${text}](${node.link.href})`;
    }

    // Escape backslashes first, then replace newlines with spaces and escape quotes
    const cleanText = text.replace(/\\/g, '\\\\').replace(/\n/g, ' ').replace(/"/g, '\\"').trim();

    // Wrap in quotes if contains special characters or spaces
    return this.needsQuotes(cleanText) ? `"${cleanText}"` : cleanText;
  }

  /**
   * Check if text needs to be wrapped in quotes
   */
  private needsQuotes(text: string): boolean {
    // List of characters that require quoting
    const specialChars = /[()[\]{}"'`]/;
    return specialChars.test(text);
  }

  /**
   * Wrap node text with appropriate brackets based on node properties
   */
  private wrapWithBrackets(text: string, node: ExportNodeProperties): string {
    // You can extend this to use different bracket types based on node properties
    // For now, using round brackets as default
    const brackets = this.determineBracketType(node);
    return `${brackets.open}${text}${brackets.close}`;
  }

  /**
   * Determine bracket type based on node properties
   */
  private determineBracketType(node: ExportNodeProperties): {
    open: string;
    close: string;
  } {
    // Just bold = square brackets
    if (node.font?.weight === 'bold') {
      return { open: '[', close: ']' };
    }

    // Just colored = round brackets
    if (node.colors?.background && node.colors.background !== '#ffffff') {
      return { open: '(', close: ')' };
    }

    // Default to none
    return { open: '', close: '' };
  }
}
