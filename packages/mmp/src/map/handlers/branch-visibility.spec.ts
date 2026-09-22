import Nodes from './nodes.js';
import Node from '../models/node.js';
import { DefaultNodeValues } from '../options.js';
import MmpMap from '../map.js';

/**
 * Hiding a branch stays local to one person, so a second person keeps adding
 * nodes to a branch this person hid. These tests pin the toggle to one
 * decision per branch, so children that disagree end up in the same state
 * instead of swapping.
 */

interface NodesInternals {
  nodes: Map<string, Node>;
  selectedNode: Node;
}

function makeTree(): {
  handler: Nodes;
  internals: NodesInternals;
  nodes: Record<string, Node>;
} {
  const map = {
    options: { defaultNode: DefaultNodeValues },
    draw: { update: jest.fn() },
    history: { save: jest.fn() },
  } as unknown as MmpMap;

  const handler = new Nodes(map);
  map.nodes = handler;
  const internals = handler as unknown as NodesInternals;

  const root = new Node({
    id: 'root',
    parent: null,
    k: 1,
    isRoot: true,
    coordinates: { x: 0, y: 0 },
  });
  const first = new Node({
    id: 'first',
    parent: root,
    k: 1,
    coordinates: { x: 200, y: 0 },
  });
  const second = new Node({
    id: 'second',
    parent: root,
    k: 1,
    coordinates: { x: 200, y: 100 },
  });
  const grandchild = new Node({
    id: 'grandchild',
    parent: first,
    k: 1,
    coordinates: { x: 400, y: 0 },
  });

  const nodes = { root, first, second, grandchild };
  for (const node of Object.values(nodes)) internals.nodes.set(node.id, node);

  return { handler, internals, nodes };
}

describe('toggleBranchVisibility', () => {
  it('hides every descendant of the selected node', () => {
    const { handler, internals, nodes } = makeTree();
    internals.selectedNode = nodes.root;

    handler.toggleBranchVisibility();

    expect(nodes.root.hasHiddenChildNodes).toBe(true);
    expect(nodes.first.hidden).toBe(true);
    expect(nodes.second.hidden).toBe(true);
    expect(nodes.grandchild.hidden).toBe(true);
  });

  it('shows every descendant again', () => {
    const { handler, internals, nodes } = makeTree();
    internals.selectedNode = nodes.root;

    handler.toggleBranchVisibility();
    handler.toggleBranchVisibility();

    expect(nodes.root.hasHiddenChildNodes).toBe(false);
    expect(nodes.first.hidden).toBe(false);
    expect(nodes.second.hidden).toBe(false);
    expect(nodes.grandchild.hidden).toBe(false);
  });

  it('shows a branch whose children disagree instead of swapping them', () => {
    const { handler, internals, nodes } = makeTree();
    internals.selectedNode = nodes.root;
    handler.toggleBranchVisibility();

    // A node that reached the map while the branch was already hidden and kept
    // its visible state.
    const late = new Node({
      id: 'late',
      parent: nodes.root,
      k: 1,
      coordinates: { x: 200, y: 200 },
    });
    internals.nodes.set(late.id, late);

    handler.toggleBranchVisibility();

    expect(nodes.first.hidden).toBe(false);
    expect(nodes.second.hidden).toBe(false);
    expect(late.hidden).toBe(false);
    expect(nodes.root.hasHiddenChildNodes).toBe(false);
  });

  it('leaves a branch hidden further down hidden', () => {
    const { handler, internals, nodes } = makeTree();

    internals.selectedNode = nodes.first;
    handler.toggleBranchVisibility();

    internals.selectedNode = nodes.root;
    handler.toggleBranchVisibility();
    handler.toggleBranchVisibility();

    expect(nodes.first.hidden).toBe(false);
    expect(nodes.second.hidden).toBe(false);
    expect(nodes.first.hasHiddenChildNodes).toBe(true);
    expect(nodes.grandchild.hidden).toBe(true);
  });

  it('does nothing to a node without children', () => {
    const { handler, internals, nodes } = makeTree();
    internals.selectedNode = nodes.second;

    handler.toggleBranchVisibility();

    expect(nodes.second.hasHiddenChildNodes).toBe(false);
  });
});

describe('addNode', () => {
  it('hides a node added to a branch the person hid', () => {
    const { handler, internals, nodes } = makeTree();
    internals.selectedNode = nodes.root;
    handler.toggleBranchVisibility();

    const added = handler.addNode(
      { coordinates: { x: 200, y: 200 } },
      false,
      false,
      nodes.root.id
    );

    expect(added.hidden).toBe(true);
  });

  it('shows a node added to a branch nobody hid', () => {
    const { handler, nodes } = makeTree();

    const added = handler.addNode(
      { coordinates: { x: 200, y: 200 } },
      false,
      false,
      nodes.root.id
    );

    expect(added.hidden).toBe(false);
  });
});
