import * as d3 from 'd3';
import { ZoomBehavior, D3ZoomEvent } from 'd3';
import Map from '../map.js';
import Log from '../../utils/log.js';
import type { Bounds } from './node-geometry.js';

// The space, in screen pixels, panIntoView leaves between the bounds it shows
// and the edge of the view. panIntoView divides it by the zoom scale to get
// map units.
const PAN_MARGIN = 40;

/**
 * How far the view has to move along one axis so that it spans [min, max]:
 * zero when it already does, the distance to the nearer edge otherwise, and
 * the distance between the two middles when the span is wider than the view.
 */
function panDistance(
  min: number,
  max: number,
  viewMin: number,
  viewMax: number
): number {
  if (max - min > viewMax - viewMin) {
    return (min + max) / 2 - (viewMin + viewMax) / 2;
  }
  if (min < viewMin) return min - viewMin;
  if (max > viewMax) return max - viewMax;

  return 0;
}

/**
 * Manage the zoom events of the map.
 */
export default class Zoom {
  private map: Map;

  private zoomBehavior: ZoomBehavior<SVGSVGElement, unknown>;

  /**
   * Get the associated map instance and initialize the d3 zoom behavior.
   * @param {Map} map
   */
  constructor(map: Map) {
    this.map = map;

    this.zoomBehavior = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 2])
      .on('zoom', (event: D3ZoomEvent<SVGSVGElement, unknown>) => {
        this.map.dom.g.attr('transform', event.transform.toString());
      });
  }

  /**
   * Zoom in the map.
   * @param {number} duration
   */
  public zoomIn = (duration?: number) => {
    if (duration && typeof duration !== 'number') {
      Log.error('The parameter must be a number', 'type');
    }

    this.move(true, duration);
  };

  /**
   * Zoom out the map.
   * @param {number} duration
   */
  public zoomOut = (duration?: number) => {
    if (duration && typeof duration !== 'number') {
      Log.error('The parameter must be a number', 'type');
    }

    this.move(false, duration);
  };

  /**
   * Center the root node in the mind map.
   * @param {number} duration
   * @param {number} type
   */
  public center = (type?: 'zoom' | 'position', duration = 500) => {
    if (type && type !== 'zoom' && type !== 'position') {
      Log.error('The type must be a string ("zoom" or "position")', 'type');
    }

    if (duration && typeof duration !== 'number') {
      Log.error('The duration must be a number', 'type');
    }

    const root = this.map.nodes.getRoot(),
      x = root.coordinates.x,
      y = root.coordinates.y;

    // A transition applies on a later animation frame, and an interrupt, such
    // as the one d3-zoom sends on mousedown, cancels it. A zero duration
    // therefore sets the transform on the selection before this returns.
    const svg = duration
      ? this.map.dom.svg.transition().duration(duration)
      : this.map.dom.svg;

    switch (type) {
      case 'zoom':
        this.zoomBehavior.scaleTo(svg, 1);
        break;
      case 'position':
      default:
        this.zoomBehavior.translateTo(svg, x, y);
    }
  };

  /**
   * Return the part of the map the svg shows, in map coordinates, or null
   * when the svg is missing or has no size, as in jsdom or before the svg is
   * attached.
   * @returns {Bounds | null} visible area
   */
  public visibleArea = (): Bounds | null => {
    const svg = this.map.dom.svg.node();
    if (!svg) return null;

    const { width, height } = svg.getBoundingClientRect();
    if (!width || !height) return null;

    const t = d3.zoomTransform(svg);
    return {
      minX: -t.x / t.k,
      maxX: (width - t.x) / t.k,
      minY: -t.y / t.k,
      maxY: (height - t.y) / t.k,
    };
  };

  /**
   * Pan the view the shortest distance that shows `bounds` with a margin of
   * PAN_MARGIN screen pixels around it, at any zoom scale. On an axis where the view is too small for them,
   * the pan puts the middle of `bounds` in the middle of the view. A view
   * that already shows them stays put. Like `center`, a zero duration moves
   * the view before this returns.
   * @param {Bounds} bounds
   * @param {number} duration
   */
  public panIntoView = (bounds: Bounds, duration = 500) => {
    const svg = this.map.dom.svg.node();
    const view = this.visibleArea();
    if (!svg || !view) return;

    const margin = PAN_MARGIN / d3.zoomTransform(svg).k;
    const dx = panDistance(
      bounds.minX - margin,
      bounds.maxX + margin,
      view.minX,
      view.maxX
    );
    const dy = panDistance(
      bounds.minY - margin,
      bounds.maxY + margin,
      view.minY,
      view.maxY
    );
    if (dx === 0 && dy === 0) return;

    const target = duration
      ? this.map.dom.svg.transition().duration(duration)
      : this.map.dom.svg;

    // translateBy works in map units, and moving the view by d moves the
    // content by -d.
    this.zoomBehavior.translateBy(target, -dx, -dy);
  };

  /**
   * Return the d3 zoom behavior.
   * @returns {ZoomBehavior} zoom
   */
  public getZoomBehavior(): ZoomBehavior<SVGSVGElement, unknown> {
    return this.zoomBehavior;
  }

  /**
   * Move the zoom in a direction (true: in, false: out).
   * @param {boolean} direction
   * @param {number} duration
   */
  private move(direction: boolean, duration = 50) {
    const svg = this.map.dom.svg.transition().duration(duration);

    this.zoomBehavior.scaleBy(svg, direction ? 4 / 3 : 3 / 4);
  }
}
