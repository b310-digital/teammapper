import Nodes from './nodes.js';
import Node, { NodeProperties } from '../models/node.js';
import MmpMap from '../map.js';

/**
 * The left and right arrow keys walk a branch. A node left of the root moves
 * outward on Left and back to its parent on Right, and a node on the right
 * does the opposite. The root has no parent and no side, so either key moves
 * it to the lowest child on the side that key names.
 */

const ROOT = new Node({
  id: 'root',
  parent: null,
  k: 1,
  isRoot: true,
  coordinates: { x: 0, y: 0 },
});

function makeNode(
  id: string,
  parent: Node,
  coordinates: NodeProperties['coordinates']
): Node {
  return new Node({ id, parent, k: 1, coordinates });
}

const LEFT_CHILD = makeNode('left', ROOT, { x: -200, y: 0 });
const LEFT_GRANDCHILD = makeNode('left-low', LEFT_CHILD, { x: -400, y: 100 });
const RIGHT_CHILD = makeNode('right', ROOT, { x: 200, y: 0 });

function selectionAfterBranchMove(
  selected: Node,
  direction: boolean
): string[] {
  const handler = new Nodes({ rootId: ROOT.id } as unknown as MmpMap);
  const internals = handler as unknown as {
    nodes: Map<string, Node>;
    selectedNode: Node;
    moveSelectionOnBranch(direction: boolean): void;
  };

  for (const node of [ROOT, LEFT_CHILD, LEFT_GRANDCHILD, RIGHT_CHILD]) {
    internals.nodes.set(node.id, node);
  }
  internals.selectedNode = selected;

  const selectNode = jest.fn();
  handler.selectNode = selectNode;

  internals.moveSelectionOnBranch(direction);

  return selectNode.mock.calls.map(call => call[0]);
}

describe('moveSelectionOnBranch', () => {
  it('moves the root to a left-hand child on Left', () => {
    expect(selectionAfterBranchMove(ROOT, true)).toEqual([LEFT_CHILD.id]);
  });

  it('moves the root to a right-hand child on Right', () => {
    expect(selectionAfterBranchMove(ROOT, false)).toEqual([RIGHT_CHILD.id]);
  });

  it('moves a left-hand node outward on Left', () => {
    expect(selectionAfterBranchMove(LEFT_CHILD, true)).toEqual([
      LEFT_GRANDCHILD.id,
    ]);
  });

  it('moves a left-hand node back to its parent on Right', () => {
    expect(selectionAfterBranchMove(LEFT_CHILD, false)).toEqual([ROOT.id]);
  });

  it('moves a right-hand node back to its parent on Left', () => {
    expect(selectionAfterBranchMove(RIGHT_CHILD, true)).toEqual([ROOT.id]);
  });
});
