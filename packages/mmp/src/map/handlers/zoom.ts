import * as d3 from 'd3';
import { ZoomBehavior, D3ZoomEvent } from 'd3';
import Map from '../map.js';
import { Event } from './events.js';
import Log from '../../utils/log.js';

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
    this.map.events.call(Event.zoomIn);
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
    this.map.events.call(Event.zoomOut);
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

    const svg = this.map.dom.svg.transition().duration(duration);

    switch (type) {
      case 'zoom':
        this.zoomBehavior.scaleTo(svg, 1);
        break;
      case 'position':
      default:
        this.zoomBehavior.translateTo(svg, x, y);
    }

    this.map.events.call(Event.center);
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
