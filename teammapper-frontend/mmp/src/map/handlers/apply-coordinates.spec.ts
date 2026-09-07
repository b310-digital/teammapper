import Nodes from './nodes';
import MmpMap from '../map';
import { Coordinates, ExportNodeProperties } from '../models/node';

/**
 * Snapshots here are shaped the way an import delivers them: the root has
 * `parent: ''` and `isRoot: true`, and a node without a saved position has no
 * `coordinates` key at all.
 */

function createHandler(): Nodes {
  // No live map needed: the snapshot's nodes do not exist yet, so everything is
  // derived from the snapshot itself.
  return new Nodes({} as unknown as MmpMap);
}

function makeNode(
  id: string,
  parent: string,
  options: { isRoot?: boolean; coordinates?: Coordinates } = {}
): ExportNodeProperties {
  return {
    id,
    parent,
    k: 1,
    isRoot: options.isRoot ?? false,
    detached: false,
    ...(options.coordinates ? { coordinates: options.coordinates } : {}),
  };
}

/** The largest shape the AI import prompt produces: 4 topics x 3 subtopics. */
function buildAiShapeSnapshot(): ExportNodeProperties[] {
  const snapshot: ExportNodeProperties[] = [
    makeNode('root', '', { isRoot: true }),
  ];

  ['A', 'B', 'C', 'D'].forEach(branch => {
    snapshot.push(makeNode(branch, 'root'));
    for (let i = 1; i <= 3; i++) {
      snapshot.push(makeNode(`${branch}${i}`, branch));
    }
  });

  return snapshot;
}

describe('applyCoordinatesToMapSnapshot', () => {
  it('hands back the very same array when there is nothing to position', () => {
    const handler = createHandler();
    const snapshot = [
      makeNode('root', '', { isRoot: true, coordinates: { x: 0, y: 0 } }),
      makeNode('left', 'root', { coordinates: { x: -200, y: 60 } }),
      makeNode('right', 'root', { coordinates: { x: 200, y: 60 } }),
    ];

    const result = handler.applyCoordinatesToMapSnapshot(snapshot);

    // Identity, not equality: a fully-positioned snapshot skips the layout
    // altogether instead of rebuilding an equal array.
    expect(result).toBe(snapshot);
  });

  it('preserves already-positioned nodes and assigns positions only to the rest', () => {
    const handler = createHandler();
    const preservedCoordinates: Coordinates = { x: 600, y: 60 };
    const snapshot = [
      makeNode('root', '', { isRoot: true, coordinates: { x: 0, y: 0 } }),
      makeNode('positioned', 'root', { coordinates: preservedCoordinates }),
      makeNode('coordinateLess', 'root'),
    ];

    const result = handler.applyCoordinatesToMapSnapshot(snapshot);

    expect(result.find(node => node.id === 'positioned')?.coordinates).toBe(
      preservedCoordinates
    );
    expect(
      result.find(node => node.id === 'coordinateLess')?.coordinates
    ).toBeDefined();
  });

  it('assigns finite coordinates to every node of a coordinate-less import', () => {
    const handler = createHandler();

    const result = handler.applyCoordinatesToMapSnapshot(
      buildAiShapeSnapshot()
    );

    result.forEach(node => {
      expect(Number.isFinite(node.coordinates?.x)).toBe(true);
      expect(Number.isFinite(node.coordinates?.y)).toBe(true);
    });
  });
});
