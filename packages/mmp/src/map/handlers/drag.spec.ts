import * as d3 from 'd3';
import type { D3DragEvent } from 'd3';
import { create } from '../../index.js';
import InMemoryMapData from '../data/in-memory-map-data.js';
import { nodeRecord } from '../../test/stub-map.js';
import { stubSvgLengths } from '../../test/svg-lengths.js';

/**
 * A drag moves a preview and writes the positions to the map data in one
 * batch when it ends. A change of the map data during the drag draws from
 * the data and keeps the preview.
 */

type DragEvent = D3DragEvent<SVGGElement, string, unknown>;

interface DragInternals {
  started(event: DragEvent, id: string): void;
  dragged(event: DragEvent, id: string): void;
  ended(event: DragEvent, id: string): void;
}

beforeAll(stubSvgLengths);

afterEach(() => {
  document.body.innerHTML = '';
});

/** root -> a -> b, root -> c, drawn by a real map. */
function makeMap() {
  const data = new InMemoryMapData([
    nodeRecord({ id: 'root', isRoot: true }),
    nodeRecord({ id: 'a', parent: 'root', coordinates: { x: 200, y: 0 } }),
    nodeRecord({ id: 'b', parent: 'a', coordinates: { x: 400, y: 0 } }),
    nodeRecord({ id: 'c', parent: 'root', coordinates: { x: -200, y: 0 } }),
  ]);
  const ref = document.createElement('div');
  document.body.appendChild(ref);
  const map = create('map', ref, undefined, data);
  const changes = jest.fn();
  data.subscribe(changes);
  return { data, map, changes, drag: map.drag as unknown as DragInternals };
}

function transformOf(id: string): string | null {
  const group = d3
    .selectAll<SVGGElement, string>('g.node')
    .filter(datum => datum === id)
    .node();
  return group?.getAttribute('transform') ?? null;
}

function move(drag: DragInternals, id: string, dx: number, dy: number) {
  drag.dragged({ dx, dy } as DragEvent, id);
}

describe('drag', () => {
  it('moves a preview and writes nothing until it ends', () => {
    const { data, drag, changes } = makeMap();

    drag.started({} as DragEvent, 'a');
    move(drag, 'a', 50, 10);

    expect(transformOf('a')).toBe('translate(250,10)');
    expect(transformOf('b')).toBe('translate(450,10)');
    expect(data.node('a')?.coordinates).toEqual({ x: 200, y: 0 });
    expect(changes).not.toHaveBeenCalled();
  });

  it('writes the moved positions in one change when it ends', () => {
    const { data, drag, changes } = makeMap();

    drag.started({} as DragEvent, 'a');
    move(drag, 'a', 50, 10);
    move(drag, 'a', 10, 0);
    drag.ended({} as DragEvent, 'a');

    expect(changes).toHaveBeenCalledTimes(1);
    expect(data.node('a')?.coordinates).toEqual({ x: 260, y: 10 });
    expect(data.node('b')?.coordinates).toEqual({ x: 460, y: 10 });
  });

  it('mirrors the descendants when the node crosses its tree root', () => {
    const { data, drag } = makeMap();

    drag.started({} as DragEvent, 'a');
    move(drag, 'a', -300, 0);
    drag.ended({} as DragEvent, 'a');

    expect(data.node('a')?.coordinates).toEqual({ x: -100, y: 0 });
    expect(data.node('b')?.coordinates).toEqual({ x: -300, y: 0 });
  });

  it('scans the map data once at the start and never per move', () => {
    const { data, drag } = makeMap();
    const scan = jest.spyOn(data, 'nodes');

    drag.started({} as DragEvent, 'a');
    move(drag, 'a', 5, 5);
    move(drag, 'a', 5, 5);
    move(drag, 'a', 5, 5);

    expect(scan).toHaveBeenCalledTimes(1);
  });

  it('keeps the preview through a peer write and writes the preview at the end', () => {
    const { data, drag } = makeMap();
    drag.started({} as DragEvent, 'a');
    move(drag, 'a', 50, 10);

    data.updateNode('a', 'coordinates', { x: 0, y: 300 });
    data.updateNode('b', 'name', 'peer');

    expect(transformOf('a')).toBe('translate(250,10)');
    expect(transformOf('b')).toBe('translate(450,10)');

    drag.ended({} as DragEvent, 'a');

    expect(data.node('a')?.coordinates).toEqual({ x: 250, y: 10 });
    expect(data.node('b')?.coordinates).toEqual({ x: 450, y: 10 });
  });

  it('puts the nodes back at their data positions when a peer protects the branch', () => {
    const { data, drag, map } = makeMap();
    const refused = jest.fn();
    map.instance.on('nodeProtected', refused);
    drag.started({} as DragEvent, 'a');
    move(drag, 'a', 50, 10);

    data.updateNode('root', 'protected', true);
    drag.ended({} as DragEvent, 'a');

    expect(data.node('a')?.coordinates).toEqual({ x: 200, y: 0 });
    expect(transformOf('a')).toBe('translate(200,0)');
    expect(transformOf('b')).toBe('translate(400,0)');
    expect(refused).toHaveBeenCalledTimes(1);
  });

  it('ends without a write when a peer replaces the map', () => {
    const { data, drag, changes } = makeMap();
    drag.started({} as DragEvent, 'a');
    move(drag, 'a', 50, 10);

    data.replaceMap([
      nodeRecord({ id: 'root', isRoot: true }),
      nodeRecord({ id: 'a', parent: 'root', coordinates: { x: 600, y: 0 } }),
    ]);
    changes.mockClear();
    move(drag, 'a', 50, 10);
    drag.ended({} as DragEvent, 'a');

    expect(changes).not.toHaveBeenCalled();
    expect(data.node('a')?.coordinates).toEqual({ x: 600, y: 0 });
    expect(transformOf('a')).toBe('translate(600,0)');
  });

  it('selects the dragged node', () => {
    const { map, drag } = makeMap();

    drag.started({} as DragEvent, 'c');

    expect(map.instance.getSelectedNode()?.id).toBe('c');
  });
});

describe('a drawn map', () => {
  it('binds node ids to the node groups', () => {
    makeMap();

    expect(d3.selectAll<SVGGElement, unknown>('g.node').data()).toEqual([
      'root',
      'a',
      'b',
      'c',
    ]);
    expect(d3.selectAll<SVGPathElement, unknown>('path.branch').data()).toEqual(
      ['a', 'b', 'c']
    );
  });
});
