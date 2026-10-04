import { fakeDraw } from '../../test/fake-draw.js';
import { firedEvents, nodeRecord, stubMap } from '../../test/stub-map.js';
import type { MapSnapshot } from '@teammapper/shared';

function handlerWith(snapshot: MapSnapshot) {
  const stub = stubMap(snapshot, {
    // Every node measured at 100 by 30.
    draw: fakeDraw(() => ({ width: 100, height: 30 })),
  });
  stub.draw.update.mockClear();

  return { ...stub, handler: stub.nodes };
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
  it('writes new coordinates to the nodes', () => {
    const { handler, map } = handlerWith(aiShapedNodes());

    handler.distributeNodes();

    const moved = map.export
      .asJSON()
      .filter(n => n.coordinates?.x !== 0 || n.coordinates?.y !== 0);
    expect(moved.length).toBeGreaterThan(0);
  });

  it('hands every node to the layout, so hidden nodes keep their room', () => {
    // The layout never reads the view state. Child nodes this person hid are
    // still laid out, so showing them again does not leave them piled up.
    const children = [1, 2, 3, 4].map(i => node(`c${i}`, 'parent'));
    const { handler, map } = handlerWith([
      node('root', '', true),
      node('parent', 'root'),
      ...children,
    ]);
    map.viewState.restore({ nodesWithHiddenChildren: ['parent'] });

    handler.distributeNodes();

    // Filtered out of the layout input they would all keep y: 0.
    const childYs = children.map(
      child => handler.record(child.id)?.coordinates.y
    );
    expect(new Set(childYs).size).toBe(4);
  });

  it('redraws the map once rather than once per node', () => {
    const { handler, draw } = handlerWith(aiShapedNodes());

    handler.distributeNodes();

    expect(draw.update).toHaveBeenCalledTimes(1);
  });

  it('emits a distribute event so the sync layer can propagate the rewrite', () => {
    const { handler, events } = handlerWith(aiShapedNodes());

    handler.distributeNodes();

    expect(firedEvents(events)).toContain('distribute');
  });

  it('does not emit the distribute event when notification is suppressed', () => {
    const { handler, events } = handlerWith(aiShapedNodes());

    handler.withNotify(false, handler.distributeNodes);

    expect(firedEvents(events)).not.toContain('distribute');
  });

  it('leaves an empty map alone', () => {
    const { handler, draw, events } = handlerWith([]);

    handler.distributeNodes();

    expect(draw.update).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });
});
