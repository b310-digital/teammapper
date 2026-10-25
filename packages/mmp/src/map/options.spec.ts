import { create } from '../index.js';
import MmpMap from './map.js';
import InMemoryMapData from './data/in-memory-map-data.js';
import { stubSvgLengths } from '../test/svg-lengths.js';
import type { MapNodeSettings } from '@teammapper/shared';
import type { OptionParameters } from './options.js';

/**
 * The settings dialog changes the user settings while the map stays drawn, so
 * `Options.update` has to apply them to the open map.
 */

beforeAll(stubSvgLengths);

function makeMap(options?: OptionParameters): MmpMap {
  const ref = document.createElement('div');
  document.body.appendChild(ref);
  const map = create('map', ref, options, new InMemoryMapData());
  map.instance.new();
  return map;
}

function nodeSettings(name: string): MapNodeSettings {
  return {
    name,
    link: { href: '' },
    image: { src: '', size: 60 },
    colors: { name: '#111111', background: '#222222', branch: '', link: '' },
    font: { size: 18, style: 'normal', weight: 'normal' },
  };
}

describe('Options.update', () => {
  let map: MmpMap;

  afterEach(() => map.instance.destroy());

  describe('centerOnResize', () => {
    it('centers the map on a window resize once turned on', () => {
      map = makeMap({ centerOnResize: false });
      const center = jest.spyOn(map.zoom, 'center');

      map.options.update('centerOnResize', true);
      window.dispatchEvent(new Event('resize'));

      expect(center).toHaveBeenCalledTimes(1);
    });

    it('leaves the map in place on a window resize once turned off', () => {
      map = makeMap({ centerOnResize: true });
      const center = jest.spyOn(map.zoom, 'center');

      map.options.update('centerOnResize', false);
      window.dispatchEvent(new Event('resize'));

      expect(center).not.toHaveBeenCalled();
    });
  });

  describe('showLinktext', () => {
    it('stores the new value', () => {
      map = makeMap({ showLinktext: false });

      map.options.update('showLinktext', true);

      expect(map.options.showLinktext).toBe(true);
    });

    it('redraws the nodes', () => {
      map = makeMap({ showLinktext: false });
      const drawAll = jest.spyOn(map.draw, 'drawAll');

      map.options.update('showLinktext', true);

      expect(drawAll).toHaveBeenCalled();
    });

    it('skips the redraw when the value stays the same', () => {
      map = makeMap({ showLinktext: true });
      const drawAll = jest.spyOn(map.draw, 'drawAll');

      map.options.update('showLinktext', true);

      expect(drawAll).not.toHaveBeenCalled();
    });
  });

  describe('defaultNode', () => {
    it('gives the next new node the new name', () => {
      map = makeMap();

      map.options.update('defaultNode', nodeSettings('Fresh node'));
      const node = map.instance.addNode(
        {},
        map.instance.exportRootProperties()?.id
      );

      expect(node?.name).toBe('Fresh node');
    });

    it('keeps the library defaults for properties the settings omit', () => {
      map = makeMap();

      map.options.update('defaultNode', nodeSettings('Fresh node'));

      expect(map.options.defaultNode.isRoot).toBe(false);
    });
  });

  describe('rootNode', () => {
    it('stores the new root node defaults', () => {
      map = makeMap();

      map.options.update('rootNode', nodeSettings('Fresh root'));

      expect(map.options.rootNode).toEqual(
        expect.objectContaining({ name: 'Fresh root', isRoot: true })
      );
    });
  });
});
