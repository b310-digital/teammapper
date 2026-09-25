import Draw from './draw.js';
import Nodes from './nodes.js';
import Node from '../models/node.js';
import { DefaultNodeValues } from '../options.js';
import MmpMap from '../map.js';

/**
 * A node image is a base64 raster data URL, drawn as is, or an
 * `image:<uuid>` reference, drawn from the URL the map's resolver returns.
 * The renderer loads no other value. A failed load hides the image and keeps
 * the value.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';
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

function makeMap(resolveImageUrl?: (reference: string) => string | null) {
  const map = {
    rootId: 'root',
    options: { defaultNode: DefaultNodeValues, resolveImageUrl },
    draw: { update: jest.fn(), clear: jest.fn() },
    events: { call: jest.fn() },
    history: { save: jest.fn() },
  } as unknown as MmpMap;
  const draw = new Draw(map, document.createElement('div'));
  map.draw = draw;
  map.nodes = new Nodes(map);
  return { map, draw };
}

function makeNode(src: string): Node {
  const node = new Node({
    id: 'root',
    k: 1,
    parent: null,
    isRoot: true,
    image: { src, size: 60 },
  });
  node.dom = document.createElementNS(SVG_NS, 'g');
  node.dimensions = { width: 100, height: 40 };
  return node;
}

describe('node images', () => {
  const originalImage = globalThis.Image;

  beforeEach(() => {
    FakeImage.created = [];
    globalThis.Image = FakeImage as unknown as typeof Image;
  });

  afterEach(() => {
    globalThis.Image = originalImage;
  });

  it('draws a data URL as is', () => {
    const { draw } = makeMap();
    const node = makeNode(DATA_URL);

    draw.setImage(node);
    lastImage().load();

    expect(node.dom.querySelector('image')?.getAttribute('href')).toBe(
      DATA_URL
    );
  });

  it('draws a reference from the URL the resolver returns', () => {
    const resolve = jest.fn(() => '/api/maps/m/images/i');
    const { draw } = makeMap(resolve);
    const node = makeNode(REFERENCE);

    draw.setImage(node);
    lastImage().load();

    expect(resolve).toHaveBeenCalledWith(REFERENCE);
    expect(node.dom.querySelector('image')?.getAttribute('href')).toBe(
      '/api/maps/m/images/i'
    );
  });

  it.each([
    'https://example.local/tracker.png',
    'http://127.0.0.1/x.png',
    'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>',
    'data:image/svg+xml,svg',
    'data:text/html,hello',
  ])('loads nothing for the value %p', src => {
    const { draw } = makeMap();
    const node = makeNode(src);

    draw.setImage(node);

    expect(FakeImage.created).toHaveLength(0);
    expect(node.dom.querySelector('image')).toBeNull();
  });

  it('draws no image for a reference without a resolver', () => {
    const { draw } = makeMap();
    const node = makeNode(REFERENCE);

    draw.setImage(node);

    expect(FakeImage.created).toHaveLength(0);
    expect(node.dom.querySelector('image')).toBeNull();
  });

  it('hides an image that fails to load and keeps its value', () => {
    const { draw } = makeMap(() => '/api/maps/m/images/i');
    const node = makeNode(REFERENCE);

    draw.setImage(node);
    lastImage().fail();

    expect(node.dom.querySelector('image')).toBeNull();
    expect(node.image.src).toBe(REFERENCE);
  });

  it('keeps the reference when the size of an image that failed to load changes', () => {
    const { map, draw } = makeMap(() => '/api/maps/m/images/i');
    const node = makeNode(REFERENCE);
    map.nodes.setNode(node.id, node);
    draw.setImage(node);
    lastImage().fail();

    map.nodes.updateNode('imageSize', 90, false, false, node.id);

    expect(node.image).toEqual({ src: REFERENCE, size: 90 });
  });

  it('positions no image when a data URL failed to load', () => {
    const { draw } = makeMap();
    const node = makeNode(DATA_URL);
    draw.setImage(node);
    lastImage().fail();

    expect(() => draw.updateImagePosition(node)).not.toThrow();
    expect(node.image.src).toBe(DATA_URL);
  });

  it('keeps the new image when the replaced one fails to load late', () => {
    const { draw } = makeMap(() => '/api/maps/m/images/i');
    const node = makeNode(REFERENCE);

    draw.setImage(node);
    const stale = lastImage();
    node.image.src = DATA_URL;
    draw.setImage(node);
    lastImage().load();
    stale.fail();

    expect(node.dom.querySelector('image')?.getAttribute('href')).toBe(
      DATA_URL
    );
  });

  it('ignores a load that finishes after the image was replaced', () => {
    const { draw } = makeMap(() => '/api/maps/m/images/i');
    const node = makeNode(REFERENCE);

    draw.setImage(node);
    const stale = lastImage();
    node.image.src = DATA_URL;
    draw.setImage(node);
    lastImage().load();
    stale.load();

    expect(node.dom.querySelector('image')?.getAttribute('href')).toBe(
      DATA_URL
    );
  });
});
