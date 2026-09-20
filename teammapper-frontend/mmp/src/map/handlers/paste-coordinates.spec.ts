import CopyPaste from './copy-paste';
import MmpMap from '../map';
import Node, { NodeProperties } from '../models/node';
import type {
  ExportNodeProperties,
  MapNodeCoordinates,
} from '@teammapper/shared';

/**
 * A pasted node keeps the offset it had to its old parent. When the new parent
 * sits on the other side of the root, the horizontal part of that offset is
 * mirrored. The root itself has no side, so a paste onto it mirrors whatever
 * the old parent's side was.
 */

const ROOT = new Node({
  id: 'root',
  parent: null,
  k: 1,
  isRoot: true,
  coordinates: { x: 0, y: 0 },
});

function makeNode(properties: Partial<NodeProperties> & { id: string }): Node {
  return new Node({ k: 1, parent: ROOT, ...properties });
}

function copied(
  id: string,
  parent: string | null,
  coordinates: MapNodeCoordinates
): ExportNodeProperties {
  return { id, parent, k: 1, coordinates };
}

function placementOf(
  pasted: ExportNodeProperties,
  oldParent: ExportNodeProperties,
  newParent: Node
): MapNodeCoordinates {
  const map = {
    nodes: {
      getRoot: () => ROOT,
      getOrientation: (node: Node) =>
        node.isRoot ? undefined : node.coordinates.x < ROOT.coordinates.x,
      // No zoom transform applies in these tests, so this is the identity.
      fixCoordinates: (coordinates: MapNodeCoordinates) => coordinates,
    },
  } as unknown as MmpMap;

  const handler = new CopyPaste(map) as unknown as {
    copiedNodes: ExportNodeProperties[];
    calculatePastedCoordinates(
      nodeProperties: ExportNodeProperties,
      newParentNode: Node
    ): MapNodeCoordinates;
  };
  handler.copiedNodes = [oldParent, pasted];

  return handler.calculatePastedCoordinates(pasted, newParent);
}

describe('calculatePastedCoordinates', () => {
  const leftParent = copied('old', 'root', { x: -200, y: 0 });
  const rightParent = copied('old', 'root', { x: 200, y: 0 });

  it('keeps the offset when both parents are on the same side', () => {
    const pasted = copied('child', 'old', { x: -300, y: 50 });
    const newParent = makeNode({
      id: 'new',
      coordinates: { x: -400, y: 100 },
    });

    expect(placementOf(pasted, leftParent, newParent)).toEqual({
      x: -500,
      y: 150,
    });
  });

  it('mirrors the offset when the new parent is on the other side', () => {
    const pasted = copied('child', 'old', { x: -300, y: 50 });
    const newParent = makeNode({ id: 'new', coordinates: { x: 400, y: 100 } });

    expect(placementOf(pasted, leftParent, newParent)).toEqual({
      x: 500,
      y: 150,
    });
  });

  it('mirrors the offset of a left-hand subtree pasted onto the root', () => {
    const pasted = copied('child', 'old', { x: -300, y: 50 });

    expect(placementOf(pasted, leftParent, ROOT)).toEqual({ x: 100, y: 50 });
  });

  it('mirrors the offset of a right-hand subtree pasted onto the root', () => {
    const pasted = copied('child', 'old', { x: 300, y: 50 });

    expect(placementOf(pasted, rightParent, ROOT)).toEqual({ x: -100, y: 50 });
  });
});
