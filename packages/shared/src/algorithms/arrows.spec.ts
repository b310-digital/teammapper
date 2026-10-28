import { arrowKey, canConnect, selectArrowsWithin } from './arrows';
import type { TreeNodeLike } from './tree';
import type { MapArrow } from '../models';

const nodes: TreeNodeLike[] = [
  { id: 'root', parent: null, isRoot: true },
  { id: 'a', parent: 'root' },
  { id: 'b', parent: 'root' },
  { id: 'a1', parent: 'a' },
  { id: 'other', parent: null },
];

describe('arrowKey', () => {
  it('joins source and target with a colon', () => {
    expect(arrowKey('a', 'b')).toBe('a:b');
  });

  it('yields different keys for the two directions', () => {
    expect(arrowKey('a', 'b')).not.toBe(arrowKey('b', 'a'));
  });
});

describe('canConnect', () => {
  it('allows an arrow between two unrelated nodes', () => {
    expect(canConnect(nodes, [], 'a1', 'b')).toBeNull();
  });

  it('refuses an arrow from a node to itself', () => {
    expect(canConnect(nodes, [], 'a', 'a')).toBe('self');
  });

  it('refuses a second arrow with the same source and target', () => {
    const arrows: MapArrow[] = [{ source: 'a', target: 'b' }];
    expect(canConnect(nodes, arrows, 'a', 'b')).toBe('duplicate');
  });

  it('allows the opposite direction of an existing arrow', () => {
    const arrows: MapArrow[] = [{ source: 'a', target: 'b' }];
    expect(canConnect(nodes, arrows, 'b', 'a')).toBeNull();
  });

  it('refuses an arrow from a parent to its child', () => {
    expect(canConnect(nodes, [], 'a', 'a1')).toBe('parent');
  });

  it('refuses an arrow from a child to its parent', () => {
    expect(canConnect(nodes, [], 'a1', 'a')).toBe('parent');
  });

  it('allows an arrow from a grandparent to a grandchild', () => {
    expect(canConnect(nodes, [], 'root', 'a1')).toBeNull();
  });

  it('allows an arrow between two roots', () => {
    expect(canConnect(nodes, [], 'root', 'other')).toBeNull();
  });

  it('refuses an arrow naming a node the map does not hold', () => {
    expect(canConnect(nodes, [], 'a', 'missing')).toBe('missing');
  });

  it('refuses an arrow from a node the map does not hold', () => {
    expect(canConnect(nodes, [], 'missing', 'a')).toBe('missing');
  });
});

describe('selectArrowsWithin', () => {
  const arrows: MapArrow[] = [
    { source: 'a', target: 'a1' },
    { source: 'a1', target: 'b' },
    { source: 'b', target: 'root' },
  ];

  it('keeps the arrows whose two endpoints both lie in the set', () => {
    expect(selectArrowsWithin(arrows, new Set(['a', 'a1']))).toEqual([
      { source: 'a', target: 'a1' },
    ]);
  });

  it('returns nothing for an empty set', () => {
    expect(selectArrowsWithin(arrows, new Set())).toEqual([]);
  });
});
