import type { RecordLookup } from './nodes.js';
import { nodeRecord, stubMap } from '../../test/stub-map.js';
import type { MapNodeCoordinates, MapSnapshot } from '@teammapper/shared';

/**
 * Where a new node under `parent` goes, on a map holding `existing`. The new
 * node is not in the map data yet, as when `addNode` calls this.
 */
function placementOf(
  parent: string,
  existing: MapSnapshot
): MapNodeCoordinates {
  const { nodes } = stubMap(existing);

  return (
    nodes as unknown as {
      calculateCoordinates(
        parent: string,
        lookup: RecordLookup
      ): MapNodeCoordinates;
    }
  ).calculateCoordinates(parent, nodes.record);
}

describe('calculateCoordinates', () => {
  const root = nodeRecord({
    id: 'root',
    isRoot: true,
    coordinates: { x: 0, y: 0 },
  });
  const leftBranch = nodeRecord({
    id: 'left',
    parent: 'root',
    coordinates: { x: -200, y: -120 },
  });
  const rightBranch = nodeRecord({
    id: 'right',
    parent: 'root',
    coordinates: { x: 200, y: -120 },
  });

  it('puts the first child of the root one column to the left and above it', () => {
    expect(placementOf('root', [root])).toEqual({ x: -200, y: -120 });
  });

  it('puts the second child of the root on the empty right side', () => {
    expect(placementOf('root', [root, leftBranch])).toEqual({
      x: 200,
      y: -120,
    });
  });

  it('stacks a third child below the lowest sibling on the emptier side', () => {
    expect(placementOf('root', [root, leftBranch, rightBranch])).toEqual({
      x: -200,
      y: -60,
    });
  });

  it('keeps a grandchild on the side of its branch', () => {
    expect(placementOf('left', [root, leftBranch])).toEqual({
      x: -400,
      y: -240,
    });
  });

  it('stacks a second grandchild below its sibling', () => {
    const firstGrandchild = nodeRecord({
      id: 'grandchild',
      parent: 'left',
      coordinates: { x: -400, y: -240 },
    });

    expect(placementOf('left', [root, leftBranch, firstGrandchild])).toEqual({
      x: -400,
      y: -180,
    });
  });

  describe('in a second tree right of the main tree', () => {
    const secondRoot = nodeRecord({
      id: 'second-root',
      coordinates: { x: 1000, y: 0 },
    });
    const secondLeft = nodeRecord({
      id: 'second-left',
      parent: 'second-root',
      coordinates: { x: 800, y: -120 },
    });
    const existing = [root, leftBranch, rightBranch, secondRoot];

    it('puts the first child of the second root on its left', () => {
      expect(placementOf('second-root', existing)).toEqual({
        x: 800,
        y: -120,
      });
    });

    it('puts the second child of the second root on its empty right', () => {
      expect(placementOf('second-root', [...existing, secondLeft])).toEqual({
        x: 1200,
        y: -120,
      });
    });

    it('keeps a grandchild on the left of its own tree root', () => {
      expect(placementOf('second-left', [...existing, secondLeft])).toEqual({
        x: 600,
        y: -240,
      });
    });
  });
});
