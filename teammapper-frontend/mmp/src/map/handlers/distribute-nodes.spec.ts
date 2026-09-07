import * as d3 from 'd3';
import Nodes from './nodes';
import Node from '../models/node';
import MmpMap from '../map';
import { Event } from './events';

interface StubMap {
  id: string;
  draw: { update: jest.Mock; drawBranch: jest.Mock };
  history: { save: jest.Mock };
  events: { call: jest.Mock };
}

function stubMap(): StubMap {
  return {
    id: 'test-map',
    draw: {
      update: jest.fn(),
      // The real `drawBranch` returns nothing for a node without a parent.
      drawBranch: jest.fn((node: Node) => (node.parent ? 'M0,0' : undefined)),
    },
    history: { save: jest.fn() },
    events: { call: jest.fn() },
  };
}

/** Branch paths the way `draw.update()` binds them: one per node but the root. */
function attachBranchPaths(mapId: string, nodes: Node[]): void {
  d3.select(document.body)
    .append('svg')
    .selectAll('path')
    .data<Node>(nodes.slice(1))
    .enter()
    .append('path')
    .attr('class', `${mapId}_branch`)
    .attr('id', node => `${node.id}_branch`);
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
    detached: false,
    hidden: false,
    coordinates: { x: 0, y: 0 },
    dimensions: { width: 100, height: 30 },
    ...overrides,
  } as unknown as Node;
}

interface NodesInternals {
  nodes: Map<string, Node>;
}

function handlerWith(nodes: Node[]): { handler: Nodes; map: StubMap } {
  const map = stubMap();
  const handler = new Nodes(map as unknown as MmpMap);
  (handler as unknown as NodesInternals).nodes = new Map(
    nodes.map(node => [node.id, node])
  );

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
  afterEach(() => {
    document.body.innerHTML = '';
  });

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

  it('updates the transform of a node that has been drawn', () => {
    const root = liveNode('root', null, { isRoot: true });
    const setAttribute = jest.fn();
    const child = liveNode('child', root, {
      dom: { setAttribute } as unknown as SVGGElement,
    });
    const { handler } = handlerWith([root, child]);

    handler.distributeNodes();

    expect(setAttribute).toHaveBeenCalledWith(
      'transform',
      expect.stringContaining('translate(')
    );
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

    const events = map.events.call.mock.calls.map(call => call[0]);
    expect(events).toContain(Event.distribute);
  });

  it('does not emit the distribute event when notification is suppressed', () => {
    const { handler, map } = handlerWith(aiShapedNodes());

    handler.distributeNodes(false);

    const events = map.events.call.mock.calls.map(call => call[0]);
    expect(events).not.toContain(Event.distribute);
  });

  it('redraws every branch, dropping the path of a detached node', () => {
    const root = liveNode('root', null, { isRoot: true });
    const child = liveNode('child', root);
    const loose = liveNode('loose', null, { detached: true });
    const nodes = [root, child, loose];
    const { handler, map } = handlerWith(nodes);
    attachBranchPaths(map.id, nodes);

    handler.distributeNodes();

    expect(document.getElementById('child_branch')?.getAttribute('d')).toBe(
      'M0,0'
    );
    // Nothing to draw for a parentless node, so the attribute is dropped.
    expect(
      document.getElementById('loose_branch')?.getAttribute('d')
    ).toBeNull();
  });

  it('leaves an empty map alone', () => {
    const { handler, map } = handlerWith([]);

    handler.distributeNodes();

    expect(map.history.save).not.toHaveBeenCalled();
  });
});
