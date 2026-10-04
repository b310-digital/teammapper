import { create } from '../../index.js';
import { nodeRecord, ring } from '../../test/stub-map.js';
import { stubSvgLengths } from '../../test/svg-lengths.js';

/** The color a client draws around the node it selected itself. */
const HIGHLIGHT = '#c0c0c0';

beforeAll(stubSvgLengths);

afterEach(() => {
  document.body.innerHTML = '';
});

/**
 * A map with a selected child that a highlight rings, as the frontend's
 * awareness does right after the selection.
 */
function highlightedChild() {
  const ref = document.createElement('div');
  document.body.appendChild(ref);
  const map = create('map', ref);
  map.instance.new(
    [
      nodeRecord({ id: 'root', isRoot: true }),
      nodeRecord({
        id: 'child',
        parent: 'root',
        coordinates: { x: 200, y: 0 },
        colors: { name: '#666666', background: '#f5f5f5', branch: '#ffc107' },
      }),
    ],
    false
  );
  map.nodes.selectNode('child');
  map.nodes.highlightNodeWithColor('child', HIGHLIGHT);
  return map;
}

describe('the ring of the selected node', () => {
  it('keeps a highlight when the node moves', () => {
    const map = highlightedChild();

    map.nodes.updateNode('coordinates', { x: 100, y: -50 }, true, 'child');

    expect(map.draw.ringOf('child')).toBe(HIGHLIGHT);
  });

  it('keeps a highlight when the node gets a new name', () => {
    const map = highlightedChild();

    map.nodes.updateNode('name', 'Draggable Node', true, 'child');

    expect(map.draw.ringOf('child')).toBe(HIGHLIGHT);
  });

  it('darkens along with a new background', () => {
    const map = highlightedChild();

    map.nodes.updateNode('backgroundColor', '#ff0000', true, 'child');

    expect(map.draw.ringOf('child')).toBe(ring('#ff0000'));
  });
});
