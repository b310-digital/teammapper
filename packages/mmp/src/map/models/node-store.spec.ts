import Node from './node.js';
import NodeStore from './node-store.js';

/** root -> a -> b, root -> c (left of root), plus a second tree r2 -> d. */
function makeStore() {
  const store = new NodeStore();
  const root = new Node({ id: 'root', parent: null, isRoot: true, k: 1 });
  const a = new Node({
    id: 'a',
    parent: root,
    k: 1,
    coordinates: { x: 200, y: 0 },
  });
  const b = new Node({
    id: 'b',
    parent: a,
    k: 1,
    coordinates: { x: 400, y: 0 },
  });
  const c = new Node({
    id: 'c',
    parent: root,
    k: 1,
    coordinates: { x: -200, y: 0 },
  });
  const r2 = new Node({
    id: 'r2',
    parent: null,
    k: 1,
    coordinates: { x: 900, y: 0 },
  });
  const d = new Node({
    id: 'd',
    parent: r2,
    k: 1,
    coordinates: { x: 1100, y: 0 },
  });
  [root, a, b, c, r2, d].forEach(node => store.set(node));
  return { store, root, a, b, c, r2, d };
}

describe('NodeStore', () => {
  it('returns the children of a node', () => {
    const { store, root, a, c } = makeStore();

    expect(store.children(root)).toEqual([a, c]);
  });

  it('returns the descendants of a node, each parent before its children', () => {
    const { store, root, a, b, c } = makeStore();

    expect(store.descendants(root)).toEqual([a, b, c]);
  });

  it('returns the siblings of a node and none for a root', () => {
    const { store, root, a, c } = makeStore();

    expect(store.siblings(a)).toEqual([c]);
    expect(store.siblings(root)).toEqual([]);
  });

  it('returns the root of the tree a node belongs to', () => {
    const { store, root, b, r2, d } = makeStore();

    expect(store.treeRoot(b)).toBe(root);
    expect(store.treeRoot(d)).toBe(r2);
  });

  it('stops at the node that closes a cycle of ancestors', () => {
    const { store, a, b } = makeStore();
    a.parent = b;

    expect([a, b]).toContain(store.treeRoot(b));
  });

  it('tells whether a node sits left of its tree root', () => {
    const { store, root, a, c } = makeStore();

    expect(store.orientation(c)).toBe(true);
    expect(store.orientation(a)).toBe(false);
    expect(store.orientation(root)).toBeUndefined();
  });

  it('names the node carrying the protection of a node', () => {
    const { store, a, b, c } = makeStore();
    a.protected = true;

    expect(store.protectingNode(b)).toBe(a);
    expect(store.protectingNode(a)).toBe(a);
    expect(store.protectingNode(c)).toBeNull();
  });

  it('removes a node and clears every node', () => {
    const { store, b } = makeStore();

    store.delete(b.id);
    expect(store.has(b.id)).toBe(false);
    expect(store.get('a')?.id).toBe('a');

    store.clear();
    expect(store.all()).toEqual([]);
  });
});
