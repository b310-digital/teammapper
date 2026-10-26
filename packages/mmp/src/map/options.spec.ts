import * as d3 from 'd3';
import MmpMap from './map.js';
import InMemoryMapData from '../test/in-memory-map-data.js';
import { nodeRecord } from '../test/stub-map.js';
import { stubSvgLengths } from '../test/svg-lengths.js';
import type { MapNodeSettings } from '@teammapper/shared';
import type { OptionParameters } from './options.js';

/**
 * The settings dialog changes the user settings while the map stays drawn, so
 * `Options.update` has to apply them to the open map. Switching edit and drag
 * changes how the drawn nodes react to the next event and redraws nothing:
 * every node keeps its DOM element.
 */

beforeAll(stubSvgLengths);

afterEach(() => {
  document.body.innerHTML = '';
});

function makeEmptyMap(options?: OptionParameters): MmpMap {
  const ref = document.createElement('div');
  document.body.appendChild(ref);
  const map = new MmpMap(ref, options, new InMemoryMapData());
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
      map = makeEmptyMap({ centerOnResize: false });
      const center = jest.spyOn(map.zoom, 'center');

      map.options.update('centerOnResize', true);
      window.dispatchEvent(new Event('resize'));

      expect(center).toHaveBeenCalledTimes(1);
    });

    it('leaves the map in place on a window resize once turned off', () => {
      map = makeEmptyMap({ centerOnResize: true });
      const center = jest.spyOn(map.zoom, 'center');

      map.options.update('centerOnResize', false);
      window.dispatchEvent(new Event('resize'));

      expect(center).not.toHaveBeenCalled();
    });
  });

  describe('showLinktext', () => {
    it('stores the new value', () => {
      map = makeEmptyMap({ showLinktext: false });

      map.options.update('showLinktext', true);

      expect(map.options.showLinktext).toBe(true);
    });

    it('writes the link address in place of the link icon', () => {
      map = makeEmptyMap({ showLinktext: false });
      map.instance.addNode(
        { link: { href: 'https://example.com' } },
        map.instance.exportRootProperties()?.id
      );
      const linkText = () =>
        map.dom.g.select<SVGTextElement>('a.link text.link-text').node()
          ?.textContent;
      expect(linkText()).toBe('link');

      map.options.update('showLinktext', true);

      expect(linkText()).toBe('https://example.com');
    });

    it('skips the redraw when the value stays the same', () => {
      map = makeEmptyMap({ showLinktext: true });
      const drawAll = jest.spyOn(map.draw, 'drawAll');

      map.options.update('showLinktext', true);

      expect(drawAll).not.toHaveBeenCalled();
    });
  });

  describe('defaultNode', () => {
    it('gives the next new node the new name', () => {
      map = makeEmptyMap();

      map.options.update('defaultNode', nodeSettings('Fresh node'));
      const node = map.instance.addNode(
        {},
        map.instance.exportRootProperties()?.id
      );

      expect(node?.name).toBe('Fresh node');
    });

    it('keeps the library defaults for properties the settings omit', () => {
      map = makeEmptyMap();

      map.options.update('defaultNode', nodeSettings('Fresh node'));

      expect(map.options.defaultNode.isRoot).toBe(false);
    });
  });

  describe('rootNode', () => {
    it('stores the new root node defaults', () => {
      map = makeEmptyMap();

      map.options.update('rootNode', nodeSettings('Fresh root'));

      expect(map.options.rootNode).toEqual(
        expect.objectContaining({ name: 'Fresh root', isRoot: true })
      );
    });
  });
});

const IDS = ['root', 'a', 'b', 'c'];

/** root -> a -> b, root -> c, drawn by a real map. */
function makeMap(options?: OptionParameters): MmpMap {
  const data = new InMemoryMapData([
    nodeRecord({ id: 'root', isRoot: true, name: 'Root' }),
    nodeRecord({
      id: 'a',
      parent: 'root',
      name: 'A',
      coordinates: { x: 200, y: 0 },
    }),
    nodeRecord({ id: 'b', parent: 'a', coordinates: { x: 400, y: 0 } }),
    nodeRecord({
      id: 'c',
      parent: 'root',
      name: 'C',
      coordinates: { x: -200, y: 0 },
    }),
  ]);
  const ref = document.createElement('div');
  document.body.appendChild(ref);
  return new MmpMap(ref, options, data);
}

function groupOf(id: string): SVGGElement {
  const group = d3
    .selectAll<SVGGElement, string>('g.node')
    .filter(datum => datum === id)
    .node();
  if (!group) throw new Error('no group for ' + id);
  return group;
}

function groups(): Map<string, SVGGElement> {
  return new Map(IDS.map(id => [id, groupOf(id)]));
}

function nameOf(group: SVGGElement): HTMLDivElement {
  const name = group.querySelector('foreignObject > div');
  if (!(name instanceof HTMLDivElement)) throw new Error('no name element');
  return name;
}

function doubleClick(group: SVGGElement) {
  group.dispatchEvent(
    new MouseEvent('dblclick', { bubbles: true, cancelable: true })
  );
}

describe('switching an option', () => {
  it.each([false, true])(
    'keeps the DOM element of every node on setEditable(%s)',
    editable => {
      const map = makeMap({ edit: !editable, drag: !editable });
      const before = groups();

      map.instance.setEditable(editable);

      for (const id of IDS) expect(groupOf(id)).toBe(before.get(id));
    }
  );

  it.each(['edit', 'drag'])(
    'keeps the DOM element of every node when %s turns back on',
    property => {
      const map = makeMap({ [property]: false });
      const before = groups();

      map.instance.setEditable(true);

      for (const id of IDS) expect(groupOf(id)).toBe(before.get(id));
    }
  );

  it.each([false, true])(
    'does not call drawAll on setEditable(%s)',
    editable => {
      const map = makeMap({ edit: !editable, drag: !editable });
      const drawAll = jest.spyOn(map.draw, 'drawAll');

      map.instance.setEditable(editable);

      expect(drawAll).not.toHaveBeenCalled();
    }
  );
});

describe('editing a name', () => {
  it('does nothing on a double click while edit is off', () => {
    const map = makeMap();
    const group = groupOf('a');
    map.instance.setEditable(false);

    doubleClick(group);

    expect(nameOf(group).getAttribute('contenteditable')).not.toBe('true');
  });

  it('drops a running edit on setEditable(false)', () => {
    const map = makeMap();
    const group = groupOf('a');
    doubleClick(group);
    const name = nameOf(group);
    name.innerHTML = 'typed';

    map.instance.setEditable(false);
    name.dispatchEvent(new FocusEvent('blur'));

    expect(map.nodes.record('a')?.name).toBe('A');
    expect(nameOf(groupOf('a')).getAttribute('contenteditable')).toBe('false');
    expect(nameOf(groupOf('a')).innerHTML).toBe('A');
  });

  it('drops an edit that started while another ran, on setEditable(false)', () => {
    const map = makeMap();
    doubleClick(groupOf('a'));
    map.draw.enableNodeNameEditing('c');
    const name = nameOf(groupOf('c'));
    name.innerHTML = 'typed';

    map.instance.setEditable(false);
    name.dispatchEvent(new FocusEvent('blur'));

    expect(map.nodes.record('c')?.name).toBe('C');
    expect(nameOf(groupOf('c')).getAttribute('contenteditable')).toBe('false');
  });

  it('drops a running edit when the map is destroyed', () => {
    const map = makeMap();
    const name = nameOf(groupOf('a'));
    doubleClick(groupOf('a'));
    name.innerHTML = 'typed';

    map.instance.destroy();
    name.dispatchEvent(new FocusEvent('blur'));

    expect(map.nodes.record('a')?.name).toBe('A');
  });

  it('starts on a double click once edit is back on', () => {
    const map = makeMap({ edit: false });
    const group = groupOf('a');
    map.instance.setEditable(true);

    doubleClick(group);

    expect(nameOf(groupOf('a')).getAttribute('contenteditable')).toBe('true');
  });
});
