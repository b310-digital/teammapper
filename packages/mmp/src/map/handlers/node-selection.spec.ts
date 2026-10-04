import type { ResolvedNode } from '../data/node-record.js';
import { nodeRecord, stubMap } from '../../test/stub-map.js';

/**
 * The left and right arrow keys walk a branch. A node left of the root moves
 * outward on Left and back to its parent on Right, and a node on the right
 * does the opposite. The root has no parent and no side, so either key moves
 * it to the lowest child on the side that key names.
 */

const SNAPSHOT = [
  nodeRecord({ id: 'root', isRoot: true }),
  nodeRecord({ id: 'left', parent: 'root', coordinates: { x: -200, y: 0 } }),
  nodeRecord({
    id: 'left-low',
    parent: 'left',
    coordinates: { x: -400, y: 100 },
  }),
  nodeRecord({ id: 'right', parent: 'root', coordinates: { x: 200, y: 0 } }),
];

function selectionAfterBranchMove(
  selected: string,
  direction: boolean
): unknown[] {
  const { nodes } = stubMap(SNAPSHOT);
  const internals = nodes as unknown as {
    moveSelectionOnBranch(selected: ResolvedNode, direction: boolean): void;
  };
  const record = nodes.record(selected);
  if (!record) throw new Error('no node ' + selected);
  // A node id 'left' reads as a direction, so the spy selects nothing.
  const selectNode = jest
    .spyOn(nodes, 'selectNode')
    .mockImplementation(() => null);

  internals.moveSelectionOnBranch(record, direction);

  return selectNode.mock.calls.map(call => call[0]);
}

describe('moveSelectionOnBranch', () => {
  it('moves the root to a left-hand child on Left', () => {
    expect(selectionAfterBranchMove('root', true)).toEqual(['left']);
  });

  it('moves the root to a right-hand child on Right', () => {
    expect(selectionAfterBranchMove('root', false)).toEqual(['right']);
  });

  it('moves a left-hand node outward on Left', () => {
    expect(selectionAfterBranchMove('left', true)).toEqual(['left-low']);
  });

  it('moves a left-hand node back to its parent on Right', () => {
    expect(selectionAfterBranchMove('left', false)).toEqual(['root']);
  });

  it('moves a right-hand node back to its parent on Left', () => {
    expect(selectionAfterBranchMove('right', true)).toEqual(['root']);
  });
});
