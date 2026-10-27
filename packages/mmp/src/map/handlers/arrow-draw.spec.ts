import type { D3DragEvent } from 'd3';
import type { MapArrow } from '@teammapper/shared';
import MmpMap from '../map.js';
import InMemoryMapData from '../../test/in-memory-map-data.js';
import { nodeRecord } from '../../test/stub-map.js';
import { stubSvgLengths } from '../../test/svg-lengths.js';

/**
 * The renderer draws each arrow as a dashed curve with an arrowhead, in a
 * layer between the branches and the nodes, while both endpoints exist and
 * show. An arrow follows its nodes whatever moves or resizes them.
 */

type DragEvent = D3DragEvent<SVGGElement, string, unknown>;

interface DragInternals {
  started(event: DragEvent, id: string): void;
  dragged(event: DragEvent, id: string): void;
  ended(event: DragEvent, id: string): void;
}

const COLORS = { background: '#ffffff' };

beforeAll(stubSvgLengths);

afterEach(() => {
  document.body.innerHTML = '';
});

/** root -> a -> a1, root -> b, drawn by a real map, with the arrows. */
function makeMap(arrows: MapArrow[] = [{ source: 'a1', target: 'b' }]) {
  const data = new InMemoryMapData([
    nodeRecord({ id: 'root', isRoot: true, colors: COLORS }),
    nodeRecord({
      id: 'a',
      parent: 'root',
      coordinates: { x: 200, y: 0 },
      colors: COLORS,
    }),
    nodeRecord({
      id: 'a1',
      parent: 'a',
      coordinates: { x: 400, y: 0 },
      colors: COLORS,
    }),
    nodeRecord({
      id: 'b',
      parent: 'root',
      coordinates: { x: -200, y: 100 },
      colors: COLORS,
    }),
  ]);
  data.addArrows(arrows);
  const ref = document.createElement('div');
  document.body.appendChild(ref);
  const map = new MmpMap(ref, undefined, data);
  return { data, map, drag: map.drag as unknown as DragInternals };
}

function arrowGroup(key: string): SVGGElement | null {
  return document.querySelector<SVGGElement>(`g.arrow[data-key="${key}"]`);
}

function arrowShape(key: string): string | null {
  return (
    arrowGroup(key)?.querySelector('path.arrow-line')?.getAttribute('d') ?? null
  );
}

describe('drawing arrows', () => {
  it('draws the arrow layer between the branches and the nodes', () => {
    const { map } = makeMap();

    const layers = Array.from(map.dom.g.node()?.children ?? []).map(element =>
      element.getAttribute('class')
    );
    expect(layers.indexOf('arrows')).toBeGreaterThan(
      layers.indexOf('branches')
    );
    expect(layers.indexOf('arrows')).toBeLessThan(layers.indexOf('nodes'));
  });

  it('draws one dashed path with an arrowhead per arrow', () => {
    makeMap();

    const line = arrowGroup('a1:b')?.querySelector('path.arrow-line');
    expect(document.querySelectorAll('g.arrow')).toHaveLength(1);
    expect(line?.getAttribute('d')).toMatch(/^M.*Q/);
    expect(line?.getAttribute('stroke-dasharray')).toBeTruthy();
    expect(line?.getAttribute('marker-end')).toMatch(/^url\(#/);
  });

  it('defines the arrowhead once, inside the exported group', () => {
    const { map } = makeMap([
      { source: 'a1', target: 'b' },
      { source: 'b', target: 'a1' },
    ]);

    expect(map.dom.g.node()?.querySelectorAll('marker')).toHaveLength(1);
  });

  it('gives each arrow a wider transparent path to click', () => {
    makeMap();

    const hit = arrowGroup('a1:b')?.querySelector('path.arrow-hit');
    expect(hit?.getAttribute('d')).toBe(arrowShape('a1:b'));
  });

  it('draws nothing for an arrow whose endpoint is missing', () => {
    makeMap([{ source: 'a1', target: 'later' }]);

    expect(arrowGroup('a1:later')).toBeNull();
  });

  it('draws the arrow once the missing endpoint arrives', () => {
    const { data } = makeMap([{ source: 'a1', target: 'later' }]);

    data.addNodes([
      nodeRecord({
        id: 'later',
        parent: 'root',
        coordinates: { x: 0, y: 300 },
      }),
    ]);

    expect(arrowGroup('a1:later')).not.toBeNull();
  });

  it('hides the arrow while an endpoint is hidden and draws it again once shown', () => {
    const { map } = makeMap();
    map.instance.selectNode('a');

    map.instance.toggleBranchVisibility();
    expect(arrowGroup('a1:b')).toBeNull();

    map.instance.toggleBranchVisibility();
    expect(arrowGroup('a1:b')).not.toBeNull();
  });

  it('draws an arrow a peer adds and drops one a peer removes', () => {
    const { data } = makeMap([]);

    data.addArrows([{ source: 'a1', target: 'b' }]);
    expect(arrowGroup('a1:b')).not.toBeNull();

    data.removeArrow('a1:b');
    expect(arrowGroup('a1:b')).toBeNull();
  });

  it('drops the arrow when its endpoint is removed', () => {
    const { data } = makeMap();

    data.removeNode('b');

    expect(arrowGroup('a1:b')).toBeNull();
  });

  it('draws the arrows of a replaced map', () => {
    const { data } = makeMap();

    data.replaceMap(
      [
        nodeRecord({ id: 'r', isRoot: true }),
        nodeRecord({ id: 'x', parent: 'r', coordinates: { x: 200, y: 0 } }),
        nodeRecord({ id: 'y', parent: 'r', coordinates: { x: -200, y: 0 } }),
      ],
      [{ source: 'x', target: 'y' }]
    );

    expect(document.querySelectorAll('g.arrow')).toHaveLength(1);
    expect(arrowGroup('x:y')).not.toBeNull();
  });
});

describe('arrows follow their nodes', () => {
  it('follows a coordinate update, local, from a peer or an undo', () => {
    const { data } = makeMap();
    const before = arrowShape('a1:b');

    data.updateNode('b', 'coordinates', { x: -300, y: 300 });

    expect(arrowShape('a1:b')).not.toBe(before);
  });

  it('follows the target through a drag', () => {
    const { drag } = makeMap();
    const before = arrowShape('a1:b');

    drag.started({} as DragEvent, 'b');
    drag.dragged({ dx: 50, dy: 80 } as DragEvent, 'b');

    expect(arrowShape('a1:b')).not.toBe(before);
  });

  it('follows a descendant that a drag moves along', () => {
    const { drag } = makeMap();
    const before = arrowShape('a1:b');

    drag.started({} as DragEvent, 'a');
    drag.dragged({ dx: 0, dy: 120 } as DragEvent, 'a');

    expect(arrowShape('a1:b')).not.toBe(before);
  });

  it('follows a redistribute', () => {
    const { map, data } = makeMap();
    data.updateNode('b', 'coordinates', { x: -900, y: 900 });
    const before = arrowShape('a1:b');

    map.instance.distributeNodes();

    expect(arrowShape('a1:b')).not.toBe(before);
  });

  it('follows a resize after a name change', () => {
    const { data } = makeMap();
    const before = arrowShape('a1:b');

    data.updateNode('b', 'name', 'A much longer name than before');

    expect(arrowShape('a1:b')).not.toBe(before);
  });

  it('stays drawn when its target moves below its source', () => {
    const { data } = makeMap();

    data.addNodes([
      nodeRecord({
        id: 'b',
        parent: 'a1',
        coordinates: { x: 600, y: 0 },
        colors: COLORS,
      }),
    ]);

    expect(arrowGroup('a1:b')).not.toBeNull();
  });
});

describe('clicking arrows', () => {
  it('selects the arrow and deselects the node on a click', () => {
    const { map } = makeMap();
    map.instance.selectNode('a');

    arrowGroup('a1:b')
      ?.querySelector('path.arrow-hit')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(map.instance.getSelectedArrow()).toEqual({
      source: 'a1',
      target: 'b',
    });
    expect(map.instance.getSelectedNode()).toBeNull();
    expect(arrowGroup('a1:b')?.classList.contains('selected')).toBe(true);
  });

  it('clears the arrow selection on a click on empty space', () => {
    const { map } = makeMap();
    map.instance.selectArrow('a1:b');

    document
      .querySelector('rect.map-background')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(map.instance.getSelectedArrow()).toBeNull();
    expect(map.instance.getSelectedNode()).toBeNull();
    expect(arrowGroup('a1:b')?.classList.contains('selected')).toBe(false);
  });
});
