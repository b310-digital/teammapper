import CopyPaste from './copy-paste.js';
import Nodes from './nodes.js';
import MmpMap from '../map.js';
import Node, { NodeProperties } from '../models/node.js';
import type {
  ExportNodeProperties,
  MapNodeCoordinates,
} from '@teammapper/shared';

/**
 * A pasted node keeps the offset it had to its old parent. When the new parent
 * is on the other side of its tree root, the horizontal part of that offset is
 * mirrored. A root has no side, and only a pasted tree has one as a new parent,
 * so the children of a pasted root keep the sides they had.
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

interface CopyPasteInternals {
  copy(id?: string): void;
  copiedNodes: ExportNodeProperties[];
  copiedTreeRootX: number;
  calculatePastedCoordinates(
    nodeProperties: ExportNodeProperties,
    newParentNode: Node
  ): MapNodeCoordinates;
}

/** A CopyPaste on a map holding ROOT and the live nodes the test places. */
function makeHandler(liveNodes: Node[]): {
  handler: CopyPasteInternals;
  nodes: Nodes;
} {
  const map = { rootId: ROOT.id } as unknown as MmpMap;
  const nodes = new Nodes(map);
  map.nodes = nodes;
  [ROOT, ...liveNodes].forEach(node => nodes.setNode(node.id, node));
  // No zoom transform applies in these tests, so this is the identity.
  nodes.fixCoordinates = (coordinates: MapNodeCoordinates) => coordinates;

  const handler = new CopyPaste(map) as unknown as CopyPasteInternals;

  return { handler, nodes };
}

function placementOf(
  pasted: ExportNodeProperties,
  oldParent: ExportNodeProperties,
  newParent: Node,
  liveNodes: Node[] = [newParent],
  oldTreeRootX = ROOT.coordinates.x
): MapNodeCoordinates {
  const { handler } = makeHandler(liveNodes);
  handler.copiedNodes = [oldParent, pasted];
  handler.copiedTreeRootX = oldTreeRootX;

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

  it('keeps the left-hand offset of a child whose new parent is a root', () => {
    const pasted = copied('child', 'old', { x: -300, y: 50 });

    expect(placementOf(pasted, leftParent, ROOT)).toEqual({ x: -100, y: 50 });
  });

  it('keeps the right-hand offset of a child whose new parent is a root', () => {
    const pasted = copied('child', 'old', { x: 300, y: 50 });

    expect(placementOf(pasted, rightParent, ROOT)).toEqual({ x: 100, y: 50 });
  });

  describe('with a second tree right of the main tree', () => {
    const secondRoot = new Node({
      id: 'second',
      parent: null,
      k: 1,
      coordinates: { x: 1000, y: 0 },
    });
    const oldParentNode = new Node({
      id: 'old',
      parent: secondRoot,
      k: 1,
      coordinates: { x: 800, y: 0 },
    });
    const childNode = new Node({
      id: 'child',
      parent: oldParentNode,
      k: 1,
      coordinates: { x: 700, y: 50 },
    });
    const oldParent = copied('old', 'second', { x: 800, y: 0 });
    const pasted = copied('child', 'old', { x: 700, y: 50 });
    const secondTreeRootX = secondRoot.coordinates.x;

    it('reads the old side against the root of the old tree', () => {
      const newParent = makeNode({
        id: 'new',
        coordinates: { x: -400, y: 100 },
      });

      expect(
        placementOf(
          pasted,
          oldParent,
          newParent,
          [newParent, secondRoot],
          secondTreeRootX
        )
      ).toEqual({ x: -500, y: 150 });
    });

    it('reads the new side against the root of the new tree', () => {
      // Left of the second root, and right of the main root.
      const newParent = new Node({
        id: 'new',
        parent: secondRoot,
        k: 1,
        coordinates: { x: 800, y: 100 },
      });

      expect(
        placementOf(
          pasted,
          oldParent,
          newParent,
          [newParent, secondRoot],
          secondTreeRootX
        )
      ).toEqual({ x: 700, y: 150 });
    });

    it('keeps the old tree root after the copied nodes are gone', () => {
      const newParent = makeNode({
        id: 'new',
        coordinates: { x: -400, y: 100 },
      });
      const { handler, nodes } = makeHandler([
        newParent,
        secondRoot,
        oldParentNode,
        childNode,
      ]);

      handler.copy(oldParentNode.id);
      nodes.clear();
      [ROOT, newParent].forEach(node => nodes.setNode(node.id, node));

      expect(handler.copiedTreeRootX).toBe(secondTreeRootX);
      expect(handler.calculatePastedCoordinates(pasted, newParent)).toEqual({
        x: -500,
        y: 150,
      });
    });
  });
});
