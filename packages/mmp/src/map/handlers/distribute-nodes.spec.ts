import { fakeDraw } from '../../test/fake-draw.js';
import { nodeRecord, stubMap } from '../../test/stub-map.js';
import type { MapDataChange } from '../data/map-data.js';
import type { MapSnapshot } from '@teammapper/shared';

function handlerWith(snapshot: MapSnapshot) {
  const stub = stubMap(snapshot, {
    // Every node measured at 100 by 30.
    draw: fakeDraw(() => ({ width: 100, height: 30 })),
  });
  const changes: MapDataChange[] = [];
  stub.data.subscribe(change => changes.push(change));

  return { ...stub, handler: stub.nodes, changes };
}

function node(id: string, parent: string, isRoot = false) {
  return nodeRecord({ id, parent, name: id, isRoot });
}

/** Root with four branches of three children: the shape an AI import makes. */
function aiShapedNodes(): MapSnapshot {
  const nodes: MapSnapshot = [node('root', '', true)];

  for (const branch of ['A', 'B', 'C', 'D']) {
    nodes.push(node(branch, 'root'));
    for (let i = 1; i <= 3; i++) {
      nodes.push(node(`${branch}${i}`, branch));
    }
  }
  return nodes;
}

describe('distributeNodes', () => {
  it('writes new coordinates to the map data', () => {
    const { handler, data } = handlerWith(aiShapedNodes());

    handler.distributeNodes();

    const moved = data
      .nodes()
      .filter(n => n.coordinates?.x !== 0 || n.coordinates?.y !== 0);
    expect(moved.length).toBeGreaterThan(0);
  });

  it('hands every node to the layout, so hidden nodes keep their room', () => {
    // The layout never reads the view state. Child nodes this person hid are
    // still laid out, so showing them again does not leave them piled up.
    const children = [1, 2, 3, 4].map(i => node(`c${i}`, 'parent'));
    const { handler, data, map } = handlerWith([
      node('root', '', true),
      node('parent', 'root'),
      ...children,
    ]);
    map.viewState.toggle('parent');

    handler.distributeNodes();

    // Filtered out of the layout input they would all keep y: 0.
    const childYs = children.map(child => data.node(child.id)?.coordinates?.y);
    expect(new Set(childYs).size).toBe(4);
  });

  it('writes every coordinate in one change', () => {
    const { handler, changes } = handlerWith(aiShapedNodes());

    handler.distributeNodes();

    expect(changes).toHaveLength(1);
    expect(changes[0].updated.length).toBeGreaterThan(1);
  });

  it('writes only the coordinates that change', () => {
    const { handler, changes } = handlerWith(aiShapedNodes());
    handler.distributeNodes();

    handler.distributeNodes();

    expect(changes).toHaveLength(1);
  });

  it('leaves an empty map alone', () => {
    const { handler, events, changes } = handlerWith([]);

    handler.distributeNodes();

    expect(changes).toEqual([]);
    expect(events.emit).not.toHaveBeenCalled();
  });
});
