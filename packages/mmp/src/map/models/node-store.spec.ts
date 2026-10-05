import Node from './node.js';
import NodeStore from './node-store.js';

/** root -> a -> b. */
function makeStore() {
  const store = new NodeStore();
  const root = new Node({ id: 'root', parent: null, isRoot: true, k: 1 });
  const a = new Node({ id: 'a', parent: root, k: 1 });
  const b = new Node({ id: 'b', parent: a, k: 1 });
  [root, a, b].forEach(node => store.set(node));
  return { store, root, a, b };
}

describe('NodeStore', () => {
  it('returns every node it holds, in the order they arrived', () => {
    const { store, root, a, b } = makeStore();

    expect(store.all()).toEqual([root, a, b]);
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
