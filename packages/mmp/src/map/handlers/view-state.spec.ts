import * as d3 from 'd3';
import { create } from '../../index.js';
import MmpMap from '../map.js';

/**
 * The view state holds the nodes whose child nodes this person hid, apart
 * from the map data. These specs drive a real map through `MmpInstance`.
 */

/** root -> a -> b -> c, with the root selected. */
function makeChain() {
  const ref = document.createElement('div');
  document.body.appendChild(ref);
  const map: MmpMap = create('map', ref);
  // jsdom lays nothing out; d3-zoom reads the extent from the view box.
  map.dom.svg.attr('viewBox', '0 0 800 600');
  map.instance.new();

  const root = map.instance.exportRootProperties().id;
  const a = map.instance.addNode({ name: 'a' }, false, root);
  if (!a) throw new Error('addNode added no node');
  const b = map.instance.addNode({ name: 'b' }, false, a.id);
  if (!b) throw new Error('addNode added no node');
  const c = map.instance.addNode({ name: 'c' }, false, b.id);
  if (!c) throw new Error('addNode added no node');

  return { map, root, a, b, c };
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

    map.instance.restoreViewState({ nodesWithHiddenChildren: [a.id] });

    expect([...map.viewState.hiddenNodeIds()].sort()).toEqual(
      [b.id, c.id].sort()
    );
    expect(visibility(root)).toBe('visible');
    expect(visibility(c.id)).toBe('hidden');
  });

  it('terminates on an ancestor cycle', () => {
    const { map, a, b, c } = makeChain();
    map.instance.restoreViewState({ nodesWithHiddenChildren: [b.id] });
    a.parent = b;

    // The walk from b reaches a, whose child b closes the cycle.
    expect([...map.viewState.hiddenNodeIds()].sort()).toEqual(
      [a.id, c.id].sort()
    );
  });

  it('forgets the removed nodes and announces the new view state', () => {
    const { map, a, b } = makeChain();
    map.instance.restoreViewState({ nodesWithHiddenChildren: [a.id, b.id] });
    const listener = jest.fn();
    map.instance.on('viewStateChange', listener);

    map.instance.removeNode(b.id, false);

    expect(map.instance.exportViewState()).toEqual({
      nodesWithHiddenChildren: [a.id],
    });
    expect(listener).toHaveBeenCalledWith({ nodesWithHiddenChildren: [a.id] });
  });

  it('announces nothing when a removal leaves the view state as it was', () => {
    const { map, a, c } = makeChain();
    map.instance.restoreViewState({ nodesWithHiddenChildren: [a.id] });
    const listener = jest.fn();
    map.instance.on('viewStateChange', listener);

    map.instance.removeNode(c.id, false);

    expect(listener).not.toHaveBeenCalled();
  });

  it('exports the ids of nodes the map lacks too', () => {
    const { map, a } = makeChain();

    map.instance.restoreViewState({
      nodesWithHiddenChildren: [a.id, 'not-arrived'],
    });

    expect(map.instance.exportViewState()).toEqual({
      nodesWithHiddenChildren: [a.id, 'not-arrived'],
    });
  });

  it('keeps the ids of nodes yet to arrive across a toggle', () => {
    const { map, b } = makeChain();
    map.instance.restoreViewState({
      nodesWithHiddenChildren: ['not-arrived'],
    });

    map.instance.selectNode(b.id);
    map.instance.toggleBranchVisibility();

    expect(map.instance.exportViewState()).toEqual({
      nodesWithHiddenChildren: ['not-arrived', b.id],
    });
  });

  it('exports what it restored', () => {
    const { map, a, b } = makeChain();
    const state = { nodesWithHiddenChildren: [a.id, b.id] };

    map.instance.restoreViewState(state);

    expect(map.instance.exportViewState()).toEqual(state);
  });

  it('redraws on restore and announces nothing', () => {
    const { map, b, c } = makeChain();
    const listener = jest.fn();
    map.instance.on('viewStateChange', listener);
    map.instance.on('nodeUpdate', listener);

    map.instance.restoreViewState({ nodesWithHiddenChildren: [b.id] });

    expect(visibility(b.id)).toBe('visible');
    expect(visibility(c.id)).toBe('hidden');
    expect(listener).not.toHaveBeenCalled();
  });

  it('keeps the view state across a load of the same nodes', () => {
    const { map, a, c } = makeChain();
    map.instance.restoreViewState({ nodesWithHiddenChildren: [a.id] });

    map.instance.new(map.instance.exportAsJSON(), false);

    expect(map.instance.exportViewState()).toEqual({
      nodesWithHiddenChildren: [a.id],
    });
    expect(visibility(c.id)).toBe('hidden');
  });
});
