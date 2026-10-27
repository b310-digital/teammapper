const BLACK = '#000000';
const WHITE = '#ffffff';

const HEX_COLOR = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** The channels of a `#rgb` or `#rrggbb` color, each from 0 to 255. */
function channels(color: string): number[] | null {
  const match = HEX_COLOR.exec(color);
  if (!match) return null;
  const hex =
    match[1].length === 3 ? match[1].replace(/./g, c => c + c) : match[1];
  return [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));
}

/** The relative luminance of WCAG 2. */
function luminance([r, g, b]: number[]): number {
  const linear = (channel: number) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/**
 * The WCAG 2 contrast ratio of two hex colors, from 1 to 21, or null when
 * either is no hex color.
 */
export function contrastRatio(a: string, b: string): number | null {
  const first = channels(a);
  const second = channels(b);
  if (!first || !second) return null;
  const [lighter, darker] = [luminance(first), luminance(second)].sort(
    (x, y) => y - x
  );
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Black or white, whichever contrasts more with the client color behind the
 * initials. A peer may send any string as its color, and for one that is no
 * hex color the initials stay black.
 */
export function initialsTextColor(background: string): string {
  const onBlack = contrastRatio(BLACK, background);
  const onWhite = contrastRatio(WHITE, background);
  if (onBlack === null || onWhite === null) return BLACK;
  return onWhite > onBlack ? WHITE : BLACK;
}
