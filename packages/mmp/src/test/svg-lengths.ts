/**
 * Give every svg a width of 800 and a height of 600 for d3-zoom. jsdom
 * implements no SVG lengths, and d3-zoom reads the extent of an svg without a
 * view box from them. A map centers while it is created, before a spec could
 * set a view box.
 */
export function stubSvgLengths() {
  for (const [side, value] of [
    ['width', 800],
    ['height', 600],
  ] as const) {
    Object.defineProperty(SVGSVGElement.prototype, side, {
      configurable: true,
      get: () => ({ baseVal: { value } }),
    });
  }
}
