import * as d3 from 'd3';
import Zoom from './zoom.js';
import MmpMap from '../map.js';

/**
 * Centering with a zero duration moves the view before it returns. A map
 * load and an import center that way, and the first click after them relies
 * on the view already showing the main root.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/** A map with an 800 by 600 svg and its main root at (100, 50). */
function makeMap() {
  const svgElement = document.createElementNS(SVG_NS, 'svg');
  svgElement.setAttribute('viewBox', '0 0 800 600');
  const gElement = document.createElementNS(SVG_NS, 'g');
  svgElement.appendChild(gElement);
  document.body.appendChild(svgElement);

  const root = { coordinates: { x: 100, y: 50 } };
  const map = {
    dom: { svg: d3.select(svgElement), g: d3.select(gElement) },
    nodes: { getRoot: () => root },
  } as unknown as MmpMap;

  const zoom = new Zoom(map);
  map.dom.svg.call(zoom.getZoomBehavior());
  return { zoom, svg: map.dom.svg, gElement };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('center with a zero duration', () => {
  it('moves the main root to the middle of the svg before it returns', () => {
    const { zoom, gElement } = makeMap();

    zoom.center('position', 0);

    expect(gElement.getAttribute('transform')).toBe(
      'translate(300,250) scale(1)'
    );
  });

  it('resets the scale before it returns', () => {
    const { zoom, svg, gElement } = makeMap();
    zoom.getZoomBehavior().scaleTo(svg, 2);

    zoom.center('zoom', 0);

    expect(gElement.getAttribute('transform')).toMatch(/scale\(1\)$/);
  });
});

describe('center with a duration', () => {
  it('leaves the view unchanged until the transition runs', () => {
    const { zoom, svg, gElement } = makeMap();

    zoom.center('position', 500);

    try {
      expect(gElement.getAttribute('transform')).toBeNull();
    } finally {
      svg.interrupt();
    }
  });
});
