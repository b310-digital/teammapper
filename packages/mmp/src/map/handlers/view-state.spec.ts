import * as d3 from 'd3';
import { create } from '../../index.js';
import MmpMap from '../map.js';
import InMemoryMapData from '../data/in-memory-map-data.js';
import { stubSvgLengths } from '../../test/svg-lengths.js';

/**
 * The view state holds the nodes whose child nodes this person hid, apart
 * from the map data. These specs drive a real map through `MmpInstance`.
 */

beforeAll(stubSvgLengths);

/** root -> a -> b -> c, with the root selected. */
function makeChain() {
  const ref = document.createElement('div');
  document.body.appendChild(ref);
  const data = new InMemoryMapData();
  const map: MmpMap = create('map', ref, undefined, data);
  map.instance.new();

  const root = map.instance.exportRootProperties()?.id;
  if (!root) throw new Error('the map has no main root');
  const a = map.instance.addNode({ name: 'a' }, root);
  if (!a) throw new Error('addNode added no node');
  const b = map.instance.addNode({ name: 'b' }, a.id);
  if (!b) throw new Error('addNode added no node');
  const c = map.instance.addNode({ name: 'c' }, b.id);
  if (!c) throw new Error('addNode added no node');

  return { map, data, root, a, b, c };
}

/** Select the node and hide its child nodes. */
function hideChildrenOf(map: MmpMap, id: string) {
  map.instance.selectNode(id);
  map.instance.toggleBranchVisibility();
}

function visibility(id: string): string | undefined {
  return d3
    .selectAll<SVGGElement, string>('g.node')
    .filter(datum => datum === id)
    .node()?.style.visibility;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('ViewState', () => {
  it('hides every node below a node whose child nodes it hides', () => {
    const { map, root, a, b, c } = makeChain();

    hideChildrenOf(map, a.id);

    expect([root, a.id, b.id, c.id].map(id => map.nodes.isHidden(id))).toEqual([
      false,
      false,
      true,
      true,
    ]);
    expect(visibility(root)).toBe('visible');
    expect(visibility(c.id)).toBe('hidden');
  });

  it('terminates on an ancestor cycle', () => {
    const { map, data, a, b, c } = makeChain();
    hideChildrenOf(map, b.id);

    data.addNodes([{ ...a, parent: b.id }]);

    // The walk up from a reaches b, whose parent a closes the cycle.
    expect(map.nodes.isHidden(a.id)).toBe(true);
    expect(map.nodes.isHidden(c.id)).toBe(true);
    expect(map.nodes.isHidden(b.id)).toBe(false);
  });

  it('forgets a removed node, so the node shows its child nodes on its return', () => {
    const { map, data, a, b, c } = makeChain();
    hideChildrenOf(map, b.id);

    data.removeNode(b.id);
    data.addNodes([b, c]);

    expect(map.instance.childNodesHidden(b.id)).toBe(false);
    expect(visibility(c.id)).toBe('visible');
    expect(map.nodes.isHidden(a.id)).toBe(false);
  });

  it('keeps the view state across a load of the same nodes', () => {
    const { map, a, c } = makeChain();
    hideChildrenOf(map, a.id);

    map.instance.new(map.instance.exportAsJSON());

    expect(map.instance.childNodesHidden(a.id)).toBe(true);
    expect(visibility(c.id)).toBe('hidden');
  });
});
