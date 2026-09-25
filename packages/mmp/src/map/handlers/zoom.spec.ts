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
  return { zoom, svg: map.dom.svg, svgElement, gElement };
}

/** jsdom lays nothing out, so the svg reports the size a browser would. */
function giveSize(svgElement: SVGSVGElement, width: number, height: number) {
  jest
    .spyOn(svgElement, 'getBoundingClientRect')
    .mockReturnValue(new DOMRect(0, 0, width, height));
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

describe('visibleArea', () => {
  it('returns null for an svg with no size', () => {
    const { zoom } = makeMap();

    expect(zoom.visibleArea()).toBeNull();
  });

  it('maps the svg to map coordinates through the zoom transform', () => {
    const { zoom, svg, svgElement } = makeMap();
    giveSize(svgElement, 800, 600);
    zoom
      .getZoomBehavior()
      .transform(svg, d3.zoomIdentity.translate(100, 50).scale(2));

    expect(zoom.visibleArea()).toEqual({
      minX: -50,
      maxX: 350,
      minY: -25,
      maxY: 275,
    });
  });
});

describe('panIntoView', () => {
  it('leaves the view unchanged when it already shows the bounds', () => {
    const { zoom, svgElement, gElement } = makeMap();
    giveSize(svgElement, 800, 600);

    zoom.panIntoView({ minX: 100, maxX: 200, minY: 100, maxY: 200 }, 0);

    expect(gElement.getAttribute('transform')).toBeNull();
  });

  it('pans the shortest distance that shows the bounds with the margin', () => {
    const { zoom, svgElement, gElement } = makeMap();
    giveSize(svgElement, 800, 600);

    zoom.panIntoView({ minX: 900, maxX: 1000, minY: -100, maxY: 0 }, 0);

    // 1000 plus a margin of 40 has to reach the right edge at 800, and -100
    // minus 40 the top edge at 0.
    expect(gElement.getAttribute('transform')).toBe(
      'translate(-240,140) scale(1)'
    );
  });

  it('pans in map units at a scale other than 1', () => {
    const { zoom, svg, svgElement, gElement } = makeMap();
    giveSize(svgElement, 800, 600);
    zoom.getZoomBehavior().scaleTo(svg, 2, [0, 0]);

    zoom.panIntoView({ minX: 500, maxX: 550, minY: 100, maxY: 150 }, 0);

    // The view spans x 0 to 400. At scale 2 the margin of 40 pixels takes 20
    // map units, so 550 plus 20 is 170 map units, or 340 pixels, past it.
    expect(gElement.getAttribute('transform')).toBe(
      'translate(-340,0) scale(2)'
    );
  });

  it('keeps the margin at 40 pixels when zoomed out', () => {
    const { zoom, svg, svgElement, gElement } = makeMap();
    giveSize(svgElement, 800, 600);
    zoom.getZoomBehavior().scaleTo(svg, 0.5, [0, 0]);

    zoom.panIntoView({ minX: 1500, maxX: 1700, minY: 100, maxY: 150 }, 0);

    // The view spans x 0 to 1600. At scale 0.5 the margin takes 80 map
    // units, so 1700 plus 80 is 180 map units, or 90 pixels, past it.
    expect(gElement.getAttribute('transform')).toBe(
      'translate(-90,0) scale(0.5)'
    );
  });

  it('does nothing for an svg with no size', () => {
    const { zoom, gElement } = makeMap();

    zoom.panIntoView({ minX: 5000, maxX: 5100, minY: 0, maxY: 100 }, 0);

    expect(gElement.getAttribute('transform')).toBeNull();
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
