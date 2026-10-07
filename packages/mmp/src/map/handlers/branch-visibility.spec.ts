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

    toggle(map, second);

    expect(map.viewState.hidesChildren(second)).toBe(false);
  });

  it('reports no hidden child nodes once a peer removes the last child node', () => {
    const { map, data, first, grandchild } = makeTree();
    toggle(map, first);

    data.removeNode(grandchild);

    expect(map.instance.childNodesHidden(first)).toBe(false);
    expect(map.viewState.hidesChildren(first)).toBe(true);
  });

  it('forgets a removed node whose child nodes were hidden', () => {
    const { map, data, root, first } = makeTree();
    toggle(map, first);
    map.instance.selectNode(root);

    data.removeNode(first);

    expect(map.viewState.isEmpty()).toBe(true);
  });

  it('does nothing while nothing is selected', () => {
    const { map } = makeTree();
    map.nodes.deselectNode();

    map.instance.toggleBranchVisibility();

    expect(map.viewState.isEmpty()).toBe(true);
  });

  it('fires no event', () => {
    const { map, root } = makeTree();
    const listener = jest.fn();
    map.instance.on('mapChange', listener);
    map.instance.on('nodeSelect', listener);

    map.instance.toggleBranchVisibility();

    expect(map.instance.childNodesHidden(root)).toBe(true);
    expect(listener).not.toHaveBeenCalled();
  });
});

/**
 * makeTree, plus two nodes a peer adds: `sibling` below `second` and `leaf`
 * below `grandchild`.
 */
function makeDeepTree(): Tree {
  const tree = makeTree();
  tree.data.addNodes([
    nodeRecord({ id: 'sibling', parent: tree.second, name: 'sibling' }),
    nodeRecord({ id: 'leaf', parent: tree.grandchild, name: 'leaf' }),
  ]);
  return tree;
}

function branchPath(id: string): SVGPathElement {
  const path = d3
    .selectAll<SVGPathElement, string>('path.branch')
    .filter(datum => datum === id)
    .node();
  if (!path) throw new Error('no branch for ' + id);
  return path;
}

/**
 * What a draw shows of each node and branch, by node id: the position, the
 * visibility, the hidden eye icon and the branch shape.
 */
function drawnState() {
  const nodes = d3
    .selectAll<SVGGElement, string>('g.node')
    .nodes()
    .map(group => [
      d3.select<SVGGElement, string>(group).datum(),
      group.getAttribute('transform'),
      group.style.visibility,
      group.querySelector('text.hidden-icon') !== null,
    ]);
  const branches = d3
    .selectAll<SVGPathElement, string>('path.branch')
    .nodes()
    .map(path => [
      d3.select<SVGPathElement, string>(path).datum(),
      path.style.visibility,
      path.getAttribute('d'),
    ]);
  const byId = (a: unknown[], b: unknown[]) =>
    String(a[0]).localeCompare(String(b[0]));
  return { nodes: nodes.sort(byId), branches: branches.sort(byId) };
}

/** Give the node another parent, as a peer's overwrite of its record. */
function moveTo(data: InMemoryMapData, id: string, parent: string | null) {
  const record = data.node(id);
  if (!record) throw new Error('no record for ' + id);
  data.addNodes([{ ...nodeRecord(record), parent }]);
}

/** Expect the drawn map to equal what a full redraw draws. */
function expectFullRedrawState(map: MmpMap) {
  const drawn = drawnState();
  map.draw.drawAll();
  expect(drawn).toEqual(drawnState());
}

describe('a parent change', () => {
  it('hides the moved node and its descendants below a parent whose child nodes are hidden', () => {
    const { map, data, first, second, grandchild } = makeDeepTree();
    toggle(map, second);

    moveTo(data, first, second);

    expect(visibility(first)).toBe('hidden');
    expect(visibility(grandchild)).toBe('hidden');
    expect(visibility('leaf')).toBe('hidden');
    expectFullRedrawState(map);
  });

  it('shows the moved node and its descendants again below a visible parent', () => {
    const { map, data, first, second, grandchild } = makeDeepTree();
    toggle(map, first);

    moveTo(data, grandchild, second);

    expect(visibility(grandchild)).toBe('visible');
    expect(visibility('leaf')).toBe('visible');
    expect(hasEyeIcon(first)).toBe(false);
    expectFullRedrawState(map);
  });

  it('marks the new parent once a moved node gives it child nodes', () => {
    const { map, data, first, second } = makeTree();
    // toggle() skips a node without child nodes, so the spec writes the view
    // state itself.
    map.viewState.toggle(second);

    moveTo(data, first, second);

    expect(hasEyeIcon(second)).toBe(true);
    expectFullRedrawState(map);
  });

  it('redraws the branches of descendants that move to another depth', () => {
    const { map, data, first } = makeDeepTree();

    moveTo(data, first, 'sibling');

    expectFullRedrawState(map);
  });

  it('redraws the descendants of a node that becomes a root', () => {
    const { map, data, first, second } = makeDeepTree();
    toggle(map, second);

    moveTo(data, first, null);

    expectFullRedrawState(map);
  });

  it('redraws the descendants of a node whose old parent goes in the same change', () => {
    const { map, data, first, second, grandchild } = makeDeepTree();
    toggle(map, second);

    data.batch(() => {
      moveTo(data, grandchild, second);
      data.removeNode(first);
    });

    expect(visibility('leaf')).toBe('hidden');
    expectFullRedrawState(map);
  });

  it('draws a parent cycle the way a full redraw does', () => {
    const { map, data, first, grandchild } = makeDeepTree();

    moveTo(data, first, grandchild);

    expectFullRedrawState(map);
  });

  it('draws a node moved during a drag at its drag preview', () => {
    const { map, data, first, second } = makeDeepTree();
    map.draw.setPreview(first, { x: 500, y: 400 });

    moveTo(data, first, second);

    expectFullRedrawState(map);
  });

  it('leaves the descendants of a node alone when another attribute changes', () => {
    const { data, root, grandchild } = makeDeepTree();
    const group = jest.spyOn(nodeGroup(grandchild).style, 'setProperty');
    const branch = jest.spyOn(branchPath(grandchild), 'setAttribute');

    data.updateNode(root, 'name', 'renamed');

    expect(group).not.toHaveBeenCalled();
    expect(branch).not.toHaveBeenCalled();
  });

  it('redraws the descendants of a node whose missing parent arrives', () => {
    const { map, data, second, grandchild } = makeDeepTree();
    toggle(map, second);
    moveTo(data, grandchild, 'late');

    data.addNodes([
      nodeRecord({
        id: 'late',
        parent: second,
        name: 'late',
        coordinates: { x: 300, y: 300 },
      }),
    ]);

    expect(visibility(grandchild)).toBe('hidden');
    expect(visibility('leaf')).toBe('hidden');
    expectFullRedrawState(map);
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
