import Nodes from './nodes';
import Node, { Coordinates, NodeProperties } from '../models/node';
import MmpMap from '../map';

function makeNode(properties: Partial<NodeProperties> & { id: string }): Node {
  return new Node({ k: 1, parent: null, ...properties });
}

/**
 * The node under test is seeded alongside the existing ones because that is the
 * state `addNode` calls this in - `getSiblings` splices the node itself back
 * out, so it never counts as its own sibling.
 */
function placementOf(node: Node, existing: Node[]): Coordinates {
  const handler = new Nodes({
    rootId: 'root',
  } as unknown as MmpMap) as unknown as {
    nodes: Map<string, Node>;
    calculateCoordinates(node: Node): Coordinates;
  };
  handler.nodes = new Map([...existing, node].map(each => [each.id, each]));

  return handler.calculateCoordinates(node);
}

describe('calculateCoordinates', () => {
  const root = makeNode({
    id: 'root',
    isRoot: true,
    coordinates: { x: 0, y: 0 },
  });
  const leftBranch = makeNode({
    id: 'left',
    parent: root,
    coordinates: { x: -200, y: -120 },
  });
  const rightBranch = makeNode({
    id: 'right',
    parent: root,
    coordinates: { x: 200, y: -120 },
  });

  it('puts the first child of the root one column to the left and above it', () => {
    const child = makeNode({ id: 'first', parent: root });

    expect(placementOf(child, [root])).toEqual({ x: -200, y: -120 });
  });

  it('puts the second child of the root on the empty right side', () => {
    const child = makeNode({ id: 'second', parent: root });

    expect(placementOf(child, [root, leftBranch])).toEqual({
      x: 200,
      y: -120,
    });
  });

  it('stacks a third child below the lowest sibling on the emptier side', () => {
    const child = makeNode({ id: 'third', parent: root });

    expect(placementOf(child, [root, leftBranch, rightBranch])).toEqual({
      x: -200,
      y: -60,
    });
  });

  it('keeps a grandchild on the side of its branch', () => {
    const child = makeNode({ id: 'grandchild', parent: leftBranch });

    expect(placementOf(child, [root, leftBranch])).toEqual({
      x: -400,
      y: -240,
    });
  });

  it('stacks a second grandchild below its sibling', () => {
    const firstGrandchild = makeNode({
      id: 'grandchild',
      parent: leftBranch,
      coordinates: { x: -400, y: -240 },
    });
    const child = makeNode({ id: 'second-grandchild', parent: leftBranch });

    expect(placementOf(child, [root, leftBranch, firstGrandchild])).toEqual({
      x: -400,
      y: -180,
    });
  });

  it('leaves a detached node level with its parent instead of above it', () => {
    const child = makeNode({
      id: 'detached',
      parent: leftBranch,
      detached: true,
    });

    expect(placementOf(child, [root, leftBranch])).toEqual({
      x: -200,
      y: -120,
    });
  });

  it('still shifts a detached child of the root into a column', () => {
    const child = makeNode({ id: 'detached', parent: root, detached: true });

    expect(placementOf(child, [root])).toEqual({ x: -200, y: 0 });
  });
});
