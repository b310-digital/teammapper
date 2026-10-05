import type Nodes from './nodes.js';
import type Node from '../models/node.js';
import { nodeRecord, stubMap } from '../../test/stub-map.js';
import type {
  ExportNodeProperties,
  MapNodeCoordinates,
  MapSnapshot,
} from '@teammapper/shared';

/**
 * A pasted node keeps the offset it had to its old parent. When the new parent
 * is on the other side of its tree root, the horizontal part of that offset is
 * mirrored. A root node has no side. Only a tree paste gives a node a root as
 * its new parent, and the children of that pasted root keep the sides they had.
 */

const ROOT = nodeRecord({ id: 'root', isRoot: true });

function makeNode(
  properties: Partial<ExportNodeProperties> & { id: string }
): ExportNodeProperties {
  return nodeRecord({ parent: 'root', ...properties });
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

/** A CopyPaste on a map holding ROOT and the nodes the test places. */
function makeHandler(liveNodes: MapSnapshot) {
  const stub = stubMap([ROOT, ...liveNodes]);
  const handler = stub.map.copyPaste as unknown as CopyPasteInternals;

  return { handler, ...stub };
}

function nodeOf(nodes: Nodes, id: string): Node {
  const node = nodes.getNode(id);
  if (!node) throw new Error('no node ' + id);
  return node;
}

function placementOf(
  pasted: ExportNodeProperties,
  oldParent: ExportNodeProperties,
  newParent: ExportNodeProperties,
  liveNodes: MapSnapshot = [newParent],
  oldTreeRootX = 0
): MapNodeCoordinates {
  const { handler, nodes } = makeHandler(
    newParent.id === 'root' ? [] : liveNodes
  );
  handler.copiedNodes = [oldParent, pasted];
  handler.copiedTreeRootX = oldTreeRootX;

  return handler.calculatePastedCoordinates(
    pasted,
    nodeOf(nodes, newParent.id)
  );
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
    const secondRoot = nodeRecord({
      id: 'second',
      coordinates: { x: 1000, y: 0 },
    });
    const oldParentNode = nodeRecord({
      id: 'old',
      parent: 'second',
      coordinates: { x: 800, y: 0 },
    });
    const childNode = nodeRecord({
      id: 'child',
      parent: 'old',
      coordinates: { x: 700, y: 50 },
    });
    const oldParent = copied('old', 'second', { x: 800, y: 0 });
    const pasted = copied('child', 'old', { x: 700, y: 50 });
    const secondTreeRootX = 1000;

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
      const newParent = nodeRecord({
        id: 'new',
        parent: 'second',
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

      handler.copy('old');
      nodes.removeNode('second', false);

      expect(handler.copiedTreeRootX).toBe(secondTreeRootX);
      expect(
        handler.calculatePastedCoordinates(pasted, nodeOf(nodes, 'new'))
      ).toEqual({
        x: -500,
        y: 150,
      });
    });
  });
});
