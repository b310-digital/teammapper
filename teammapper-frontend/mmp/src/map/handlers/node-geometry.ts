import type { Dimensions } from '../models/node';

/**
 * A node's real size is only known once it has been drawn. The renderer needs
 * an approximation when the browser reports no measurement (Firefox renders too
 * late to read one), and the layout needs one for a snapshot that has never
 * been drawn at all. Both use these numbers: packing the map for boxes smaller
 * than the ones that end up drawn is what makes branches overlap.
 */

// The x-axis spacing between parent and child nodes.
export const NODE_HORIZONTAL_SPACING = 200;

export const NODE_WIDTH_PADDING = 45;
export const NODE_HEIGHT_PADDING = 30;

export const MIN_TEXT_EXTENT = 25;
const WIDTH_PER_CHARACTER = 1 / 1.2;
const LINE_HEIGHT_FACTOR = 1.2;

export function estimateTextExtent(text: string, fontSize: number): Dimensions {
  const lines = text.split(/\r?\n|\r/g);
  const longest = Math.max(...lines.map(line => line.length), 1);

  return {
    width: Math.max(longest * fontSize * WIDTH_PER_CHARACTER, MIN_TEXT_EXTENT),
    height: Math.max(
      lines.length * fontSize * LINE_HEIGHT_FACTOR,
      MIN_TEXT_EXTENT
    ),
  };
}

export function estimateNodeExtent(text: string, fontSize: number): Dimensions {
  const { width, height } = estimateTextExtent(text, fontSize);

  return {
    width: width + NODE_WIDTH_PADDING,
    height: height + NODE_HEIGHT_PADDING,
  };
}
