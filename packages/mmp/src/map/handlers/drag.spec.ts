import * as d3 from 'd3';
import type { D3DragEvent } from 'd3';
import { create } from '../../index.js';
import { nodeRecord } from '../../test/stub-map.js';
import { stubSvgLengths } from '../../test/svg-lengths.js';

/**
 * A drag moves a preview the renderer draws and leaves the nodes alone until
 * it ends. Then it writes the preview positions to the nodes and announces
 * each moved node with `nodeUpdate`.
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
  const ref = document.createElement('div');
  document.body.appendChild(ref);
  const map = create('map', ref);
  map.instance.new(
    [
      nodeRecord({ id: 'root', isRoot: true }),
      nodeRecord({ id: 'a', parent: 'root', coordinates: { x: 200, y: 0 } }),
      nodeRecord({ id: 'b', parent: 'a', coordinates: { x: 400, y: 0 } }),
      nodeRecord({ id: 'c', parent: 'root', coordinates: { x: -200, y: 0 } }),
    ],
    false
  );
  const updates = jest.fn();
  map.instance.on('nodeUpdate', updates);
  return { map, updates, drag: map.drag as unknown as DragInternals };
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
  it('moves a preview and leaves the nodes alone until it ends', () => {
    const { map, drag, updates } = makeMap();

    drag.started({} as DragEvent, 'a');
    move(drag, 'a', 50, 10);

    expect(transformOf('a')).toBe('translate(250,10)');
    expect(transformOf('b')).toBe('translate(450,10)');
    expect(map.nodes.record('a')?.coordinates).toEqual({ x: 200, y: 0 });
    expect(map.draw.previewOf('a')).toEqual({ x: 250, y: 10 });
    expect(updates).not.toHaveBeenCalled();
  });

  it('announces every moved node with nodeUpdate when it ends', () => {
    const { map, drag, updates } = makeMap();

    drag.started({} as DragEvent, 'a');
    move(drag, 'a', 50, 10);
    move(drag, 'a', 10, 0);
    drag.ended({} as DragEvent, 'a');

    expect(updates.mock.calls).toEqual([
      [
        {
          nodeProperties: expect.objectContaining({
            id: 'a',
            coordinates: { x: 260, y: 10 },
          }),
          changedProperty: 'coordinates',
          previousValue: undefined,
        },
      ],
      [
        {
          nodeProperties: expect.objectContaining({
            id: 'b',
            coordinates: { x: 460, y: 10 },
          }),
          changedProperty: 'coordinates',
          previousValue: undefined,
        },
      ],
    ]);
    expect(map.nodes.record('a')?.coordinates).toEqual({ x: 260, y: 10 });
    expect(map.nodes.record('b')?.coordinates).toEqual({ x: 460, y: 10 });
    expect(map.draw.previewOf('a')).toBeUndefined();
    expect(transformOf('a')).toBe('translate(260,10)');
  });

  it('announces nothing for a drag without a move', () => {
    const { drag, updates } = makeMap();

    drag.started({} as DragEvent, 'a');
    drag.ended({} as DragEvent, 'a');

    expect(updates).not.toHaveBeenCalled();
  });

  it('mirrors the descendants when the node crosses its tree root', () => {
    const { map, drag } = makeMap();

    drag.started({} as DragEvent, 'a');
    move(drag, 'a', -300, 0);
    drag.ended({} as DragEvent, 'a');

    expect(map.nodes.record('a')?.coordinates).toEqual({ x: -100, y: 0 });
    expect(map.nodes.record('b')?.coordinates).toEqual({ x: -300, y: 0 });
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
