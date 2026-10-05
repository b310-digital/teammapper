import * as d3 from 'd3';
import { create } from '../../index.js';
import MmpMap from '../map.js';

/**
 * The renderer measures each name once it is drawn, and again whenever the
 * browser reports the name changed size: when its font loads or while the
 * person types. jsdom lays nothing out, so the specs set the sizes it reports.
 */

/** Stands in for the browser ResizeObserver, so a test decides when it fires. */
class FakeResizeObserver {
  static current: FakeResizeObserver | null = null;
  readonly observed = new Set<Element>();

  constructor(private readonly callback: ResizeObserverCallback) {
    FakeResizeObserver.current = this;
  }

  observe(target: Element) {
    this.observed.add(target);
  }

  unobserve(target: Element) {
    this.observed.delete(target);
  }

  disconnect() {
    this.observed.clear();
  }

  fire(targets: Element[]) {
    this.callback(
      targets.map(target => ({ target }) as ResizeObserverEntry),
      this as unknown as ResizeObserver
    );
  }
}

function observer(): FakeResizeObserver {
  if (!FakeResizeObserver.current) throw new Error('No observer was created');
  return FakeResizeObserver.current;
}

function makeMap(): MmpMap {
  const ref = document.createElement('div');
  document.body.appendChild(ref);
  const map = create('map', ref);
  // jsdom lays nothing out; d3-zoom reads the extent from the view box.
  map.dom.svg.attr('viewBox', '0 0 800 600');
  map.instance.new();
  return map;
}

function rootName(map: MmpMap): HTMLDivElement {
  const name = map.dom.g.node()?.querySelector('foreignObject.name > div');
  if (!(name instanceof HTMLDivElement)) throw new Error('No name was drawn');
  return name;
}

/** Make the browser report `width` by `height` for the element. */
function layOut(element: HTMLElement, width: number, height: number) {
  Object.defineProperty(element, 'offsetWidth', { value: width });
  Object.defineProperty(element, 'offsetHeight', { value: height });
}

const originalResizeObserver = globalThis.ResizeObserver;

beforeEach(() => {
  FakeResizeObserver.current = null;
  globalThis.ResizeObserver =
    FakeResizeObserver as unknown as typeof ResizeObserver;
});

afterEach(() => {
  globalThis.ResizeObserver = originalResizeObserver;
  document.body.innerHTML = '';
});

describe('measuring names', () => {
  it('observes the name of every drawn node', () => {
    const map = makeMap();

    expect(observer().observed).toEqual(new Set([rootName(map)]));
  });

  it('sizes the node from its name once the name changes size', () => {
    const map = makeMap();
    const name = rootName(map);
    const root = map.nodes.getRoot();

    layOut(name, 140, 30);
    observer().fire([name]);

    expect(map.draw.dimensionsOf(root)).toEqual({ width: 185, height: 60 });
    const foreignObject = name.parentElement;
    expect(foreignObject?.getAttribute('width')).toBe('140');
    expect(foreignObject?.getAttribute('x')).toBe('-70');
  });

  it('leaves the model alone when it measures', () => {
    const map = makeMap();
    const before = map.instance.exportAsJSON();
    const name = rootName(map);

    layOut(name, 140, 30);
    observer().fire([name]);

    expect(map.instance.exportAsJSON()).toEqual(before);
  });

  it('redraws the name when the map is drawn anew during an edit', () => {
    const map = makeMap();
    const root = map.nodes.getRoot();
    map.draw.enableNodeNameEditing(root.id);

    map.draw.clear();
    map.draw.update();

    expect(rootName(map).innerHTML).toBe(root.name);
  });

  it('disconnects the observer when the map is removed', () => {
    const map = makeMap();

    map.instance.destroy();

    expect(observer().observed.size).toBe(0);
  });

  it('stops observing the name of a removed node', () => {
    const map = makeMap();
    const child = map.instance.addNode({ name: 'child' });
    if (!child) throw new Error('addNode added no child');

    map.instance.removeNode(child.id);

    expect(observer().observed).toEqual(new Set([rootName(map)]));
  });
});

describe('a drawn map', () => {
  it('binds node ids to the node groups, branches and marks', () => {
    const map = makeMap();
    const root = map.nodes.getRoot();
    const child = map.instance.addNode({ name: 'child' });
    if (!child) throw new Error('addNode added no child');

    const g = d3.select(map.dom.g.node());
    expect(g.selectAll('g.node').data()).toEqual([root.id, child.id]);
    expect(g.selectAll('path.branch').data()).toEqual([child.id]);
    expect(g.selectAll('path.background').data()).toEqual([root.id, child.id]);
    expect(g.selectAll('foreignObject.name > div').data()).toEqual([
      root.id,
      child.id,
    ]);
  });
});
