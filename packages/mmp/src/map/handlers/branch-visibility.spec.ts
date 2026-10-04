import * as d3 from 'd3';
import { create } from '../../index.js';
import MmpMap from '../map.js';
import InMemoryMapData from '../data/in-memory-map-data.js';
import { nodeRecord } from '../../test/stub-map.js';
import { stubSvgLengths } from '../../test/svg-lengths.js';

/**
 * Hiding the child nodes of a node changes the view state of one person
 * alone, so a second person keeps adding nodes below a node whose child
 * nodes this person hid. These specs drive a real map and read the drawn
 * visibility. A peer's write goes straight to the map data.
 */

beforeAll(stubSvgLengths);

interface Tree {
  map: MmpMap;
  data: InMemoryMapData;
  root: string;
  first: string;
  second: string;
  grandchild: string;
}

/** root -> first -> grandchild, root -> second, with the root selected. */
function makeTree(): Tree {
  const ref = document.createElement('div');
  document.body.appendChild(ref);
  const data = new InMemoryMapData();
  const map = create('map', ref, undefined, data);
  map.instance.new();

  const root = map.instance.exportRootProperties()?.id;
  if (!root) throw new Error('the map has no main root');
  const first = map.instance.addNode({ name: 'first' }, root);
  const second = map.instance.addNode({ name: 'second' }, root);
  if (!first || !second) throw new Error('addNode added no child');
  const grandchild = map.instance.addNode({ name: 'grandchild' }, first.id);
  if (!grandchild) throw new Error('addNode added no grandchild');
  map.instance.selectNode(root);

  return {
    map,
    data,
    root,
    first: first.id,
    second: second.id,
    grandchild: grandchild.id,
  };
}

function nodeGroup(id: string): SVGGElement {
  const group = d3
    .selectAll<SVGGElement, string>('g.node')
    .filter(datum => datum === id)
    .node();
  if (!group) throw new Error('no group for ' + id);
  return group;
}

function visibility(id: string): string {
  return nodeGroup(id).style.visibility;
}

function hasEyeIcon(id: string): boolean {
  return nodeGroup(id).querySelector('text.hidden-icon') !== null;
}

/** Select the node and toggle the visibility of its child nodes. */
function toggle(map: MmpMap, id: string) {
  map.instance.selectNode(id);
  map.instance.toggleBranchVisibility();
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('toggleBranchVisibility', () => {
  it('hides every descendant of the selected node', () => {
    const { map, root, first, second, grandchild } = makeTree();

    toggle(map, root);

    expect(visibility(root)).toBe('visible');
    expect(visibility(first)).toBe('hidden');
    expect(visibility(second)).toBe('hidden');
    expect(visibility(grandchild)).toBe('hidden');
  });

  it('shows every descendant again', () => {
    const { map, root, first, second, grandchild } = makeTree();

    toggle(map, root);
    toggle(map, root);

    expect(visibility(first)).toBe('visible');
    expect(visibility(second)).toBe('visible');
    expect(visibility(grandchild)).toBe('visible');
  });

  it('hides a node a peer adds below a node whose child nodes are hidden', () => {
    const { map, data, root } = makeTree();
    toggle(map, root);

    data.addNodes([
      nodeRecord({
        id: 'late',
        parent: root,
        name: 'late',
        coordinates: { x: 200, y: 200 },
      }),
    ]);

    expect(visibility('late')).toBe('hidden');
  });

  it('keeps the child nodes of an inner node hidden when the outer node shows', () => {
    const { map, root, first, second, grandchild } = makeTree();
    toggle(map, first);

    toggle(map, root);
    toggle(map, root);

    expect(visibility(first)).toBe('visible');
    expect(visibility(second)).toBe('visible');
    expect(visibility(grandchild)).toBe('hidden');
    expect(map.instance.childNodesHidden(first)).toBe(true);
  });

  it('does nothing to a node without child nodes', () => {
    const { map, second } = makeTree();
    const listener = jest.fn();
    map.instance.on('viewStateChange', listener);

    toggle(map, second);

    expect(map.instance.childNodesHidden(second)).toBe(false);
    expect(listener).not.toHaveBeenCalled();
  });

  it('reports no hidden child nodes once a peer removes the last child node', () => {
    const { map, data, first, grandchild } = makeTree();
    toggle(map, first);

    data.removeNode(grandchild);

    expect(map.instance.childNodesHidden(first)).toBe(false);
    expect(map.instance.exportViewState().nodesWithHiddenChildren).toEqual([
      first,
    ]);
  });

  it('forgets a removed node whose child nodes were hidden', () => {
    const { map, data, root, first } = makeTree();
    toggle(map, first);
    map.instance.selectNode(root);
    const listener = jest.fn();
    map.instance.on('viewStateChange', listener);

    data.removeNode(first);

    expect(listener).toHaveBeenCalledWith({ nodesWithHiddenChildren: [] });
  });

  it('does nothing while nothing is selected', () => {
    const { map } = makeTree();
    const listener = jest.fn();
    map.instance.on('viewStateChange', listener);
    map.nodes.deselectNode();

    map.instance.toggleBranchVisibility();

    expect(map.instance.exportViewState().nodesWithHiddenChildren).toEqual([]);
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('the hidden eye icon', () => {
  it('shows on a node whose child nodes are hidden only', () => {
    const { map, root, first, second } = makeTree();

    toggle(map, root);

    expect(hasEyeIcon(root)).toBe(true);
    expect(hasEyeIcon(first)).toBe(false);
    expect(hasEyeIcon(second)).toBe(false);
  });

  it('leaves once a peer removes the last child node and returns with a new one', () => {
    const { map, data, first, grandchild } = makeTree();
    toggle(map, first);

    data.removeNode(grandchild);
    expect(hasEyeIcon(first)).toBe(false);

    data.addNodes([
      nodeRecord({
        id: 'late',
        parent: first,
        name: 'late',
        coordinates: { x: 9, y: 9 },
      }),
    ]);
    expect(hasEyeIcon(first)).toBe(true);
  });
});
