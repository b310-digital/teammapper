import * as d3 from 'd3';
import type { BranchStyle } from '@teammapper/shared';
import MmpMap from '../map.js';
import InMemoryMapData from '../../test/in-memory-map-data.js';
import { nodeRecord } from '../../test/stub-map.js';
import { stubSvgLengths } from '../../test/svg-lengths.js';

/**
 * The branch style is a user setting of one browser. These specs drive a real
 * map and read the drawn branch paths.
 */

beforeAll(stubSvgLengths);

afterEach(() => {
  document.body.innerHTML = '';
});

interface Tree {
  map: MmpMap;
  data: InMemoryMapData;
  root: string;
  child: string;
  grandchild: string;
}

/** root -> child -> grandchild, each child with branch color #ff0000. */
function makeTree(branchStyle?: string): Tree {
  const ref = document.createElement('div');
  document.body.appendChild(ref);
  const data = new InMemoryMapData();
  // A stale cache may hold any string, so the spec passes one unchecked.
  const options = { branchStyle: branchStyle as BranchStyle | undefined };
  const map = new MmpMap(ref, options, data);
  map.instance.new();

  const root = map.instance.exportRootProperties()?.id;
  if (!root) throw new Error('the map has no main root');
  const colors = { branch: '#ff0000' };
  const child = map.instance.addNode({ name: 'child', colors }, root);
  if (!child) throw new Error('addNode added no child');
  const grandchild = map.instance.addNode(
    { name: 'grandchild', colors },
    child.id
  );
  if (!grandchild) throw new Error('addNode added no grandchild');

  return { map, data, root, child: child.id, grandchild: grandchild.id };
}

function branchPath(id: string): SVGPathElement {
  const path = d3
    .selectAll<SVGPathElement, string>('path.branch')
    .filter(datum => datum === id)
    .node();
  if (!path) throw new Error('no branch for ' + id);
  return path;
}

function shape(id: string): string {
  return branchPath(id).getAttribute('d') ?? '';
}

/** The center the node group is translated to. */
function centerOf(id: string): string {
  const group = d3
    .selectAll<SVGGElement, string>('g.node')
    .filter(datum => datum === id)
    .node();
  const transform = group?.getAttribute('transform') ?? '';
  const match = /translate\(([^,]+),([^)]+)\)/.exec(transform);
  if (!match) throw new Error('no position for ' + id);
  return match[1] + ',' + match[2];
}

describe('tapered branches', () => {
  it('draw a closed shape filled in the branch color', () => {
    const { child } = makeTree('tapered');

    expect(shape(child)).toMatch(/Z$/);
    expect(branchPath(child).style.fill).toBe('#ff0000');
  });

  it('keep the shape drawn before branch styles existed', () => {
    const { child } = makeTree('tapered');

    // The renderer drew this path for the same tree before the branch style
    // setting, so cached settings without one see no change.
    expect(shape(child)).toBe(
      'M0,-12.8C-84,-8,8,-97.83333333333333,-162.77777777777777,-89.5' +
        'C-8,-87.16666666666667,-116,8,0,12.8Z'
    );
  });

  it('narrow with the level of the node', () => {
    const { root, child, grandchild } = makeTree('tapered');
    // The shape starts above the parent center, by a distance that grows
    // with the branch width.
    const startOffset = (id: string, parent: string) => {
      const startY = Number(/^M[^,]+,([^C]+)C/.exec(shape(id))?.[1]);
      return Number(centerOf(parent).split(',')[1]) - startY;
    };

    expect(startOffset(grandchild, child)).toBeLessThan(
      startOffset(child, root)
    );
  });

  it('are the default when the options name no style', () => {
    const { map, child } = makeTree();

    expect(map.options.branchStyle).toBe('tapered');
    expect(shape(child)).toMatch(/Z$/);
  });

  it('are the fallback for an unknown style, without an error', () => {
    const { map, child } = makeTree('zigzag');

    expect(map.options.branchStyle).toBe('tapered');
    expect(shape(child)).toMatch(/Z$/);
  });
});

describe.each<BranchStyle>(['curved', 'straight'])('%s branches', style => {
  it('draw an open path with no fill', () => {
    const { child } = makeTree(style);

    expect(shape(child)).not.toMatch(/Z/);
    expect(branchPath(child).style.fill).toBe('none');
  });

  it('stroke in the branch color, 2.5px wide with round caps', () => {
    const { child } = makeTree(style);
    const path = branchPath(child);

    expect(path.style.stroke).toBe('#ff0000');
    expect(path.style.strokeWidth).toBe('2.5');
    expect(path.style.strokeLinecap).toBe('round');
  });

  it('keep the same width at a deeper level', () => {
    const { grandchild } = makeTree(style);

    expect(branchPath(grandchild).style.strokeWidth).toBe('2.5');
  });

  it('keep no fill when the branch color changes', () => {
    const { map, child } = makeTree(style);

    map.instance.updateNode('branchColor', '#00ff00', child);

    expect(branchPath(child).style.stroke).toBe('#00ff00');
    expect(branchPath(child).style.fill).toBe('none');
  });

  it('draw no branch to a detached node', () => {
    const { data } = makeTree(style);

    data.addNodes([
      nodeRecord({
        id: 'detached',
        parent: null,
        name: 'detached',
        coordinates: { x: 400, y: 400 },
      }),
    ]);

    expect(
      d3
        .selectAll<SVGPathElement, string>('path.branch')
        .filter(datum => datum === 'detached')
        .size()
    ).toBe(0);
  });
});

describe('curved branches', () => {
  it('draw one curve from the parent center', () => {
    const { root, child } = makeTree('curved');

    expect(shape(child).startsWith('M' + centerOf(root) + 'C')).toBe(true);
    expect(shape(child).match(/C/g)).toHaveLength(1);
  });
});

describe('straight branches', () => {
  it('run from the parent center to the child center', () => {
    const { root, child } = makeTree('straight');

    expect(shape(child)).toBe('M' + centerOf(root) + 'L' + centerOf(child));
  });
});

describe('Options.update branchStyle', () => {
  it('redraws every branch in the new style', () => {
    const { map, child, grandchild } = makeTree('tapered');

    map.options.update('branchStyle', 'curved');

    expect(map.options.branchStyle).toBe('curved');
    expect(branchPath(child).style.fill).toBe('none');
    expect(branchPath(grandchild).style.fill).toBe('none');
  });

  it('fills the branches again on a switch back to tapered', () => {
    const { map, child } = makeTree('straight');

    map.options.update('branchStyle', 'tapered');

    expect(shape(child)).toMatch(/Z$/);
    expect(branchPath(child).style.fill).toBe('#ff0000');
    expect(branchPath(child).style.strokeWidth).toBe('');
  });

  it('falls back to tapered for an unknown style, without an error', () => {
    const { map } = makeTree('curved');

    map.options.update('branchStyle', 'zigzag');

    expect(map.options.branchStyle).toBe('tapered');
  });

  it('skips the redraw when the style stays the same', () => {
    const { map } = makeTree('curved');
    const drawAll = jest.spyOn(map.draw, 'drawAll');

    map.options.update('branchStyle', 'curved');

    expect(drawAll).not.toHaveBeenCalled();
  });
});
