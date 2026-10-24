import type { MapNodeDimensions, MapNodeFont } from '@teammapper/shared';

/**
 * Node sizes and their estimates. A node's real size is known once its name
 * is drawn. Before that, these functions estimate it. An estimate that comes
 * out too small makes the layout overlap branches.
 */

/** An axis-aligned bounding box in map coordinates. */
export interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

// The x-axis spacing between parent and child nodes.
export const NODE_HORIZONTAL_SPACING = 200;
// The y-axis offset of a first child above its parent.
export const NODE_VERTICAL_SPACING = 120;

export const NODE_WIDTH_PADDING = 45;
export const NODE_HEIGHT_PADDING = 30;

export const MIN_TEXT_EXTENT = 25;
const WIDTH_PER_CHARACTER = 1 / 1.2;
const LINE_HEIGHT_FACTOR = 1.2;
const DEFAULT_FONT_SIZE = 16;

/** The font a name is measured in: the node's font and the map's family. */
export interface TextFont extends MapNodeFont {
  family: string;
}

/**
 * The lines a name shows. A name holds the HTML its editor wrote, so
 * `R&amp;D` shows as `R&D` and `<br>` starts a new line.
 */
export function linesOf(name: string): string[] {
  let text = name;
  if (typeof document !== 'undefined') {
    const template = document.createElement('template');
    template.innerHTML = name.replace(/<br\s*\/?>/gi, '\n');
    text = template.content.textContent ?? '';
  }
  return text.split(/\r?\n|\r/g);
}

/**
 * Counts characters. Stands in for `measureTextExtent` where no canvas exists.
 */
export function estimateTextExtent(
  text: string,
  fontSize: number
): MapNodeDimensions {
  const lines = linesOf(text);
  const longest = Math.max(...lines.map(line => line.length), 1);

  return {
    width: Math.max(longest * fontSize * WIDTH_PER_CHARACTER, MIN_TEXT_EXTENT),
    height: Math.max(
      lines.length * fontSize * LINE_HEIGHT_FACTOR,
      MIN_TEXT_EXTENT
    ),
  };
}

export function estimateNodeExtent(
  text: string,
  fontSize: number
): MapNodeDimensions {
  return withPadding(estimateTextExtent(text, fontSize));
}

let canvasContext: OffscreenCanvasRenderingContext2D | null | undefined;

function measuringContext(): OffscreenCanvasRenderingContext2D | null {
  if (canvasContext === undefined) {
    canvasContext =
      typeof OffscreenCanvas === 'undefined'
        ? null
        : new OffscreenCanvas(1, 1).getContext('2d');
  }
  return canvasContext;
}

/**
 * The size of a name in `font`, measured on a canvas. An estimate until the
 * name is drawn.
 */
export function measureTextExtent(
  text: string,
  font: TextFont
): MapNodeDimensions {
  const size = font.size ?? DEFAULT_FONT_SIZE;
  const context = measuringContext();
  if (!context) return estimateTextExtent(text, size);

  context.font = [
    font.style ?? 'normal',
    font.weight ?? 'normal',
    size + 'px',
    font.family,
  ].join(' ');
  const lines = linesOf(text);
  const width = Math.max(...lines.map(line => context.measureText(line).width));

  return {
    width: Math.max(Math.ceil(width), MIN_TEXT_EXTENT),
    height: Math.max(lines.length * size * LINE_HEIGHT_FACTOR, MIN_TEXT_EXTENT),
  };
}

export function measureNodeExtent(
  text: string,
  font: TextFont
): MapNodeDimensions {
  return withPadding(measureTextExtent(text, font));
}

/** The box of a node around a name of the given extent. */
export function withPadding(text: MapNodeDimensions): MapNodeDimensions {
  return {
    width: text.width + NODE_WIDTH_PADDING,
    height: text.height + NODE_HEIGHT_PADDING,
  };
}
