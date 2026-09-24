import Map from '../map.js';
import Log from '../../utils/log.js';
import type { MapSnapshot } from '@teammapper/shared';
import Utils from '../../utils/utils.js';
import * as d3 from 'd3';
import DOMPurify from 'dompurify';

/**
 * Manage map image exports.
 */
export default class Export {
  private map: Map;

  /**
   * Get the associated map instance.
   * @param {Map} map
   */
  constructor(map: Map) {
    this.map = map;
  }

  /**
   * Return the snapshot (json) of the current map.
   * @returns {MapSnapshot} json
   */
  public asJSON = (): MapSnapshot => {
    const snapshot = this.map.history.current();

    return Utils.cloneObject(snapshot);
  };

  /**
   * Return the image data URI in the callback function.
   * @param {Function} callback
   * @param {string} type
   */
  public asImage = (callback: (url: string) => void, type?: string) => {
    if (typeof callback !== 'function') {
      Log.error('The first parameter must be a function', 'type');
    }

    if (type && typeof type !== 'string') {
      Log.error('The second optional parameter must be a string', 'type');
    }

    this.map.nodes.deselectNode();

    this.dataURI(url => {
      if (type === 'svg') {
        return callback(url);
      }

      const image = new Image();

      image.src = url;

      image.onload = () => {
        const canvas = document.createElement('canvas'),
          context = canvas.getContext('2d'),
          scale = window.devicePixelRatio || 1;

        // need to adjust scale of the image
        // see https://developer.mozilla.org/en-US/docs/Web/API/Window/devicePixelRatio
        canvas.style.width = image.width + 'px';
        canvas.style.height = image.height + 'px';
        canvas.width = Math.floor(image.width * scale);
        canvas.height = Math.floor(image.height * scale);

        if (!context) {
          Log.error('The canvas context is not available');
        }

        context.scale(scale, scale);

        context.drawImage(image, 0, 0);
        context.globalCompositeOperation = 'destination-over';
        context.fillStyle = this.getExportBackgroundColor();
        context.fillRect(0, 0, canvas.width, canvas.height);

        if (typeof type === 'string') {
          type = 'image/' + type;
        }
        // Safari seems to have an issue with loading all included images on time during the download of the data url.
        // This is a small workaround, as calling toBlob before seems to solve the problem most of the times.
        canvas.toBlob(() => undefined);

        callback(canvas.toDataURL(type));
      };

      image.onerror = () => {
        Log.error('The image has not been loaded correctly');
      };
    });
  };

  /**
   * Return true if dark mode is active in the document.
   */
  private isDarkModeActive(): boolean {
    return (
      typeof document !== 'undefined' &&
      Boolean(document.body?.classList.contains('dark-mode'))
    );
  }

  /**
   * Resolve export background color, using CSS variable when dark mode is active.
   */
  private getExportBackgroundColor(): string {
    if (this.isDarkModeActive() && typeof window !== 'undefined') {
      const color = window
        .getComputedStyle(document.body)
        .getPropertyValue('--color-bg-primary')
        .trim();
      return color || '#1e1e1e';
    }
    return '#ffffff';
  }

  /**
   * Convert the mind map svg in the data URI.
   * @param {Function} callback
   */
  private dataURI(callback: (url: string) => void) {
    const element = this.map.dom.g.node() as SVGGElement,
      clone = element.cloneNode(true) as SVGGElement,
      svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'),
      box = element.getBBox(),
      css = Utils.cssRules(element),
      xmlns = 'http://www.w3.org/2000/xmlns/',
      padding = 15,
      x = box.x - padding,
      y = box.y - padding,
      w = box.width + padding * 2,
      h = box.height + padding * 2;

    svg.setAttributeNS(xmlns, 'xmlns', 'http://www.w3.org/2000/svg');
    svg.setAttributeNS(xmlns, 'xmlns:xlink', 'http://www.w3.org/1999/xlink');
    svg.setAttribute('version', '1.1');
    svg.setAttribute('width', w.toString());
    svg.setAttribute('height', h.toString());
    svg.setAttribute('viewBox', [x, y, w, h].join(' '));

    // If there is css, insert it
    if (css !== '') {
      const style = document.createElement('style'),
        defs = document.createElement('defs');

      style.setAttribute('type', 'text/css');
      style.innerHTML = '<![CDATA[\n' + css + '\n]]>';
      defs.appendChild(style);
      svg.appendChild(defs);
    }

    // In dark mode, append a background rect to prevent light-colored nodes and text
    // from being unreadable on transparent backgrounds when viewed in external viewers.
    if (this.isDarkModeActive()) {
      const bgRect = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'rect'
      );
      bgRect.setAttribute('x', x.toString());
      bgRect.setAttribute('y', y.toString());
      bgRect.setAttribute('width', w.toString());
      bgRect.setAttribute('height', h.toString());
      bgRect.setAttribute('fill', this.getExportBackgroundColor());
      svg.appendChild(bgRect);
    }

    clone.setAttribute('transform', 'translate(0,0)');
    svg.appendChild(clone);

    // Remove any text related to Material Icons
    d3.select(clone).selectAll('text.material-icons').text('');

    // convert all foreignObjects to native svg text to ensure better compatibility with svg readers
    d3.select(clone)
      .selectAll<Element, unknown>('foreignObject')
      .nodes()
      .forEach((node: Element) => {
        const fo = node as HTMLElement;
        const parent = fo.parentElement;
        const xAttr = fo.getAttribute('x') || '0';
        const widthAttr = fo.getAttribute('width') || '0';
        const yAttr = fo.getAttribute('y') || '0';
        const x = parseInt(xAttr, 10) + Math.floor(parseInt(widthAttr, 10) / 2);
        const splittedText = (fo.firstChild?.textContent || '').split('\n');
        // line breaks are created via tspan elements that are relatively positioned using dy property
        const svgTextWithLineBreaks = splittedText.map(
          (text, i) =>
            `<tspan dy="${i === 0 ? '0' : '1.2em'}" x="${x}">${text}</tspan>`
        );
        const textSVG = DOMPurify.sanitize(svgTextWithLineBreaks.join(''), {
          USE_PROFILES: { svg: true },
          NAMESPACE: 'http://www.w3.org/2000/svg',
        });
        const firstChildEl = fo.firstElementChild as HTMLElement | null;
        d3.select(parent)
          .attr('width', widthAttr)
          .append('text')
          .attr(
            'y',
            parseInt(yAttr, 10) +
              parseInt(firstChildEl?.style.fontSize || '12', 10)
          )
          .attr('x', x)
          .attr('text-anchor', 'middle')
          .attr('font-family', firstChildEl?.style.fontFamily || 'sans-serif')
          .attr('font-size', firstChildEl?.style.fontSize || '12px')
          .attr('fill', firstChildEl?.style.color || '#000')
          .html(textSVG);
        fo.remove();
      });

    this.convertImages(clone, () => {
      const xmls = new XMLSerializer(),
        reader = new FileReader();

      const blob = new Blob([xmls.serializeToString(svg)], {
        type: 'image/svg+xml',
      });

      reader.readAsDataURL(blob);

      reader.onloadend = () => {
        callback(reader.result as string);
      };
    });
  }

  /**
   * If there are images in the map convert their href in dataURI.
   * @param {Element} element
   * @param {Function} callback
   */
  private convertImages(element: Element, callback: () => void) {
    const images = element.querySelectorAll<SVGImageElement>('image');
    let counter = images.length;

    if (counter > 0) {
      for (const image of Array.from(images)) {
        const canvas = document.createElement('canvas'),
          ctx = canvas.getContext('2d'),
          img = new Image(),
          href = image.getAttribute('href') || '';

        img.crossOrigin = 'Anonymous';

        img.src = href;

        img.onload = function () {
          canvas.width = img.width;
          canvas.height = img.height;
          ctx?.drawImage(img, 0, 0);

          image.setAttribute('href', canvas.toDataURL('image/png'));

          counter--;

          if (counter === 0) {
            callback();
          }
        };
        // Drop an image that cannot be fetched, so the export carries no
        // URL that depends on the server.
        img.onerror = () => {
          image.remove();
          counter--;

          if (counter === 0) {
            callback();
          }
        };
      }
    } else {
      callback();
    }
  }
}
