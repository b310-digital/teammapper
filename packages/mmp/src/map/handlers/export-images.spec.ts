import Export from './export.js';
import MmpMap from '../map.js';

/**
 * An export inlines every node image as a data URL, so the file works without
 * the server, and drops an image it cannot fetch.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Stands in for the browser Image; every load fails. */
class FailingImage {
  crossOrigin = '';
  width = 0;
  height = 0;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;

  set src(_url: string) {
    setTimeout(() => this.onerror?.());
  }
}

// Narrow accessor: only exposes the private image conversion.
type ConvertImages = (element: Element, callback: () => void) => void;
const convertImagesOf = (exporter: Export): ConvertImages => {
  const convert = (exporter as unknown as { convertImages: ConvertImages })
    .convertImages;
  return convert.bind(exporter);
};

describe('export of node images', () => {
  const originalImage = globalThis.Image;

  beforeEach(() => {
    globalThis.Image = FailingImage as unknown as typeof Image;
  });

  afterEach(() => {
    globalThis.Image = originalImage;
  });

  it('drops an image that cannot be fetched and still completes', async () => {
    const group = document.createElementNS(SVG_NS, 'g');
    const image = document.createElementNS(SVG_NS, 'image');
    image.setAttribute('href', 'api/maps/m/images/missing');
    group.appendChild(image);
    const convertImages = convertImagesOf(new Export({} as MmpMap));

    await new Promise<void>(resolve => convertImages(group, resolve));

    expect(group.querySelector('image')).toBeNull();
  });
});
