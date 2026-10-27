import * as d3 from 'd3';
import { create } from '../index.js';
import InMemoryMapData from '../test/in-memory-map-data.js';
import { nodeRecord } from '../test/stub-map.js';
import { stubSvgLengths } from '../test/svg-lengths.js';
import type { OptionParameters } from './options.js';

/**
 * What the instance `create` returns promises: one switch for edit and drag,
 * and a window resize listener that destroy removes again.
 */

beforeAll(stubSvgLengths);

afterEach(() => {
  document.body.innerHTML = '';
});

/** root -> a, drawn by a real map in its own element. */
function makeMap(options?: OptionParameters) {
  const data = new InMemoryMapData([
    nodeRecord({ id: 'root', isRoot: true, name: 'Root' }),
    nodeRecord({ id: 'a', parent: 'root', coordinates: { x: 200, y: 0 } }),
  ]);
  const ref = document.createElement('div');
  document.body.appendChild(ref);
  const instance = create(ref, data, options);
  return { data, instance };
}

function groupOf(id: string): SVGGElement {
  const group = d3
    .selectAll<SVGGElement, string>('g.node')
    .filter(datum => datum === id)
    .node();
  if (!group) throw new Error('no group for ' + id);
  return group;
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

/** A pointer drag of `dx` pixels to the right on a node group. */
function pointerDrag(group: SVGGElement, dx: number) {
  const at = (type: string, clientX: number) =>
    new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX,
      clientY: 0,
    });
  group.dispatchEvent(at('mousedown', 0));
  window.dispatchEvent(at('mousemove', dx / 2));
  window.dispatchEvent(at('mousemove', dx));
  window.dispatchEvent(at('mouseup', dx));
}

describe('setEditable', () => {
  it('starts no name edit on a double click after setEditable(false)', () => {
    const { instance } = makeMap();
    instance.setEditable(false);

    doubleClick(groupOf('a'));

    expect(nameOf(groupOf('a')).getAttribute('contenteditable')).not.toBe(
      'true'
    );
  });

  it('moves no node on a pointer drag after setEditable(false)', () => {
    const { instance, data } = makeMap();
    instance.setEditable(false);

    pointerDrag(groupOf('a'), 60);

    expect(data.node('a')?.coordinates).toEqual({ x: 200, y: 0 });
  });

  it('starts a name edit on a double click after setEditable(true)', () => {
    const { instance } = makeMap({ edit: false, drag: false });
    instance.setEditable(true);

    doubleClick(groupOf('a'));

    expect(nameOf(groupOf('a')).getAttribute('contenteditable')).toBe('true');
  });

  it('moves the node on a pointer drag after setEditable(true)', () => {
    const { instance, data } = makeMap({ edit: false, drag: false });
    instance.setEditable(true);

    pointerDrag(groupOf('a'), 60);

    expect(data.node('a')?.coordinates).toEqual({ x: 260, y: 0 });
  });
});

describe('the window resize listener', () => {
  /** A resize makes a map center its root, which reads the main root id. */
  function centersOnResize(data: InMemoryMapData): boolean {
    const read = jest.spyOn(data, 'mainRootId');
    window.dispatchEvent(new Event('resize'));
    const called = read.mock.calls.length > 0;
    read.mockRestore();
    return called;
  }

  it('centers the map when the window resizes', () => {
    const { data } = makeMap();

    expect(centersOnResize(data)).toBe(true);
  });

  it('stops centering the map once it is destroyed', () => {
    const { data, instance } = makeMap();
    instance.destroy();

    expect(centersOnResize(data)).toBe(false);
  });

  it('adds no listener when centerOnResize is false', () => {
    const { data } = makeMap({ centerOnResize: false });

    expect(centersOnResize(data)).toBe(false);
  });

  it('keeps centering a new map when the previous map is destroyed late', () => {
    const previous = makeMap();
    const { data } = makeMap();
    previous.instance.destroy();

    expect(centersOnResize(data)).toBe(true);
  });
});
