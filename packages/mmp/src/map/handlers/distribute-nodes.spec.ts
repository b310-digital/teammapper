import Nodes from './nodes.js';
import { fakeDraw } from '../../test/fake-draw.js';
import Node from '../models/node.js';
import MmpMap from '../map.js';

type StubMap = ReturnType<typeof stubMap>;

function stubMap() {
  return {
    id: 'test-map',
    // Every node measured at 100 by 30.
    draw: fakeDraw(() => ({ width: 100, height: 30 })),
    history: { save: jest.fn() },
    events: { emit: jest.fn() },
  };
}

/** Only the fields distribution reads, hence the cast. */
function liveNode(
  id: string,
  parent: Node | null,
  overrides: Partial<Node> = {}
): Node {
  return {
    id,
    parent,
    name: id,
    isRoot: false,
    hidden: false,
    coordinates: { x: 0, y: 0 },
    ...overrides,
  } as unknown as Node;
}

function handlerWith(nodes: Node[]): { handler: Nodes; map: StubMap } {
  const map = stubMap();
  const handler = new Nodes(map as unknown as MmpMap);
  nodes.forEach(node => handler.setNode(node));

  return { handler, map };
}

/** Root with four branches of three children: the shape an AI import makes. */
function aiShapedNodes(): Node[] {
  const root = liveNode('root', null, { isRoot: true });
  const nodes: Node[] = [root];

  for (const branch of ['A', 'B', 'C', 'D']) {
    const branchNode = liveNode(branch, root);
    nodes.push(branchNode);
    for (let i = 1; i <= 3; i++) {
      nodes.push(liveNode(`${branch}${i}`, branchNode));
    }
  }
  return nodes;
}

describe('distributeNodes', () => {
  it('writes new coordinates onto the live nodes', () => {
    const nodes = aiShapedNodes();
    const { handler } = handlerWith(nodes);
    const before = nodes.map(node => ({ ...node.coordinates }));

    handler.distributeNodes();

    const moved = nodes.filter(
      (node, i) =>
        node.coordinates.x !== before[i].x || node.coordinates.y !== before[i].y
    );
    expect(moved.length).toBeGreaterThan(0);
  });

  it('hands the hidden nodes to the layout too, so they keep their room', () => {
    // A collapsed branch is still laid out, so expanding it again does not
    // leave its children piled up.
    const root = liveNode('root', null, { isRoot: true });
    const collapsed = liveNode('collapsed', root);
    const nodes = [root, collapsed];
    for (let i = 1; i <= 4; i++) {
      nodes.push(liveNode(`c${i}`, collapsed, { hidden: true }));
    }
    const { handler } = handlerWith(nodes);

    handler.distributeNodes();

    // Filtered out of the layout input they would all keep y: 0.
    const hiddenYs = nodes
      .filter(node => node.hidden)
      .map(node => node.coordinates.y);
    expect(new Set(hiddenYs).size).toBe(4);
  });

  it('records the whole redistribution as a single history entry', () => {
    const { handler, map } = handlerWith(aiShapedNodes());

    handler.distributeNodes();

    expect(map.history.save).toHaveBeenCalledTimes(1);
  });

  it('redraws the map once rather than once per node', () => {
    const { handler, map } = handlerWith(aiShapedNodes());

    handler.distributeNodes();

    expect(map.draw.update).toHaveBeenCalledTimes(1);
  });

  it('emits a distribute event so the sync layer can propagate the rewrite', () => {
    const { handler, map } = handlerWith(aiShapedNodes());

    handler.distributeNodes();

    const events = map.events.emit.mock.calls.map(call => call[0]);
    expect(events).toContain('distribute');
  });

  it('does not emit the distribute event when notification is suppressed', () => {
    const { handler, map } = handlerWith(aiShapedNodes());

    handler.distributeNodes(false);

    const events = map.events.emit.mock.calls.map(call => call[0]);
    expect(events).not.toContain('distribute');
  });

  it('leaves an empty map alone', () => {
    const { handler, map } = handlerWith([]);

    handler.distributeNodes();

    expect(map.history.save).not.toHaveBeenCalled();
  });
});
