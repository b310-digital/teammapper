import { create } from '../../index.js';
import MmpMap from '../map.js';
import InMemoryMapData from '../data/in-memory-map-data.js';
import { nodeRecord } from '../../test/stub-map.js';
import { stubSvgLengths } from '../../test/svg-lengths.js';

/**
 * A peer's selection ring belongs to the render data, so a full redraw keeps
 * it for every node the map data still holds.
 */

const PEER_COLOR = '#ff0000';

beforeAll(stubSvgLengths);

afterEach(() => {
  document.body.innerHTML = '';
});

function makeMap(): { map: MmpMap; data: InMemoryMapData } {
  const data = new InMemoryMapData([
    nodeRecord({ id: 'root', isRoot: true }),
    nodeRecord({ id: 'child', parent: 'root', coordinates: { x: 200, y: 0 } }),
  ]);
  const ref = document.createElement('div');
  document.body.appendChild(ref);
  return { map: create('map', ref, undefined, data), data };
}

function strokeOf(map: MmpMap, id: string): string | undefined {
  return map.dom.g
    .selectAll<SVGGElement, string>('g.node')
    .filter(nodeId => nodeId === id)
    .select<SVGPathElement>('path.background')
    .node()?.style.stroke;
}

describe('a full redraw', () => {
  it('keeps the ring of a peer when the edit mode changes', () => {
    const { map } = makeMap();
    map.nodes.highlightNodeWithColor('child', PEER_COLOR);

    map.options.update('edit', false);

    expect(map.draw.ringOf('child')).toBe(PEER_COLOR);
    expect(strokeOf(map, 'child')).toBe(PEER_COLOR);
  });

  it('keeps the ring of the selected node when the edit mode changes', () => {
    const { map } = makeMap();
    map.nodes.selectNode('child');
    const ring = map.draw.ringOf('child');

    map.options.update('edit', false);

    expect(ring).not.toBeNull();
    expect(map.draw.ringOf('child')).toBe(ring);
    expect(strokeOf(map, 'child')).not.toBe('');
  });

  it('keeps the ring of a peer when the drag mode changes', () => {
    const { map } = makeMap();
    map.nodes.highlightNodeWithColor('child', PEER_COLOR);

    map.options.update('drag', false);

    expect(map.draw.ringOf('child')).toBe(PEER_COLOR);
  });

  it('drops the ring of a node the map data no longer holds', () => {
    const { map, data } = makeMap();
    map.nodes.highlightNodeWithColor('child', PEER_COLOR);

    data.replaceMap([nodeRecord({ id: 'root', isRoot: true })]);
    data.addNodes([nodeRecord({ id: 'child', parent: 'root' })]);

    expect(map.draw.ringOf('child')).toBeNull();
    expect(strokeOf(map, 'child')).toBe('');
  });

  it('keeps no selection ring on a node that survives a replacement', () => {
    const { map, data } = makeMap();
    map.nodes.selectNode('child');

    data.replaceMap(map.instance.exportAsJSON());

    expect(map.draw.ringOf('child')).toBeNull();
    expect(map.nodes.getSelectedNode()?.id).toBe('root');
    expect(map.draw.ringOf('root')).not.toBeNull();
  });
});

describe('an unchanged option', () => {
  it.each(['drag', 'edit'])('redraws nothing for %s', property => {
    const { map } = makeMap();
    const drawAll = jest.spyOn(map.draw, 'drawAll');

    map.options.update(property, true);

    expect(drawAll).not.toHaveBeenCalled();
  });
});
