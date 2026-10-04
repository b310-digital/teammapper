import { create } from '../../index.js';
import { DefaultRootNodeValues } from '../options.js';
import MmpMap from '../map.js';
import { stubSvgLengths } from '../../test/svg-lengths.js';

/**
 * A node image is a base64 raster data URL, drawn as is, or an
 * `image:<uuid>` reference, drawn from the URL the map's resolver returns.
 * The renderer loads no other value. A failed load hides the image and keeps
 * the value.
 */

const REFERENCE = 'image:aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const DATA_URL = 'data:image/png;base64,logo';

/** Stands in for the browser Image, so a test decides how a load ends. */
class FakeImage {
  static created: FakeImage[] = [];
  src = '';
  width = 120;
  height = 60;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor() {
    FakeImage.created.push(this);
  }

  load() {
    this.onload?.();
  }

  fail() {
    this.onerror?.();
  }
}

const lastImage = (): FakeImage => {
  const image = FakeImage.created[FakeImage.created.length - 1];
  if (!image) throw new Error('No image was created');
  return image;
};

/** A map whose only node, the root, shows the image `src`. */
function makeMap(
  src: string,
  resolveImageUrl?: (reference: string) => string | null
) {
  const ref = document.createElement('div');
  document.body.appendChild(ref);
  const map = create('map', ref, { resolveImageUrl });
  map.instance.new([
    {
      ...DefaultRootNodeValues,
      id: 'root',
      parent: null,
      k: 1,
      isRoot: true,
      image: { src, size: 60 },
    },
  ]);
  return map;
}

function setImage(map: MmpMap, src: string) {
  map.instance.updateNode('imageSrc', src, true, 'root');
}

const drawnImage = (map: MmpMap) =>
  map.dom.g.node()?.querySelector('image') ?? null;

describe('node images', () => {
  const originalImage = globalThis.Image;

  beforeAll(stubSvgLengths);

  beforeEach(() => {
    FakeImage.created = [];
    globalThis.Image = FakeImage as unknown as typeof Image;
  });

  afterEach(() => {
    globalThis.Image = originalImage;
    document.body.innerHTML = '';
  });

  it('draws a data URL as is', () => {
    const map = makeMap(DATA_URL);

    lastImage().load();

    expect(drawnImage(map)?.getAttribute('href')).toBe(DATA_URL);
  });

  it('draws a reference from the URL the resolver returns', () => {
    const resolve = jest.fn(() => '/api/maps/m/images/i');
    const map = makeMap(REFERENCE, resolve);

    lastImage().load();

    expect(resolve).toHaveBeenCalledWith(REFERENCE);
    expect(drawnImage(map)?.getAttribute('href')).toBe('/api/maps/m/images/i');
  });

  it.each([
    'https://example.local/tracker.png',
    'http://127.0.0.1/x.png',
    'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>',
    'data:image/svg+xml,svg',
    'data:text/html,hello',
  ])('loads nothing for the value %p', src => {
    const map = makeMap(src);

    expect(FakeImage.created).toHaveLength(0);
    expect(drawnImage(map)).toBeNull();
  });

  it('draws no image for a reference without a resolver', () => {
    const map = makeMap(REFERENCE);

    expect(FakeImage.created).toHaveLength(0);
    expect(drawnImage(map)).toBeNull();
  });

  it('hides an image that fails to load and keeps its value', () => {
    const map = makeMap(REFERENCE, () => '/api/maps/m/images/i');

    lastImage().fail();

    expect(drawnImage(map)).toBeNull();
    expect(map.instance.exportRootProperties()?.image?.src).toBe(REFERENCE);
  });

  it('keeps the reference when the size of an image that failed to load changes', () => {
    const map = makeMap(REFERENCE, () => '/api/maps/m/images/i');
    lastImage().fail();

    map.instance.updateNode('imageSize', 90, true, 'root');

    expect(map.instance.exportRootProperties()?.image).toEqual({
      src: REFERENCE,
      size: 90,
    });
    expect(drawnImage(map)).toBeNull();
  });

  it('loads an image that failed once only when its value changes', () => {
    const map = makeMap(DATA_URL);
    lastImage().fail();

    map.instance.updateNode('nameColor', '#ff0000', true, 'root');

    expect(FakeImage.created).toHaveLength(1);
  });

  it('keeps the new image when the replaced one fails to load late', () => {
    const map = makeMap(REFERENCE, () => '/api/maps/m/images/i');

    const stale = lastImage();
    setImage(map, DATA_URL);
    lastImage().load();
    stale.fail();

    expect(drawnImage(map)?.getAttribute('href')).toBe(DATA_URL);
  });

  it('ignores a load that finishes after the image was replaced', () => {
    const map = makeMap(REFERENCE, () => '/api/maps/m/images/i');

    const stale = lastImage();
    setImage(map, DATA_URL);
    lastImage().load();
    stale.load();

    expect(drawnImage(map)?.getAttribute('href')).toBe(DATA_URL);
  });
});
