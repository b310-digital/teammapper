import Nodes from './nodes.js';
import CopyPaste from './copy-paste.js';
import Node, { NodeProperties } from '../models/node.js';
import { DefaultNodeValues } from '../options.js';
import MmpMap from '../map.js';
import { Event } from './events.js';

/**
 * Deselecting leaves no node selected, the main root included. With nothing
 * selected, the operations that act on the selected node do nothing, and a
 * map load selects the main root again.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/** The parts of a node's DOM that selection reads: the background and name. */
function nodeDom(): SVGGElement {
  const group = document.createElementNS(SVG_NS, 'g');
  const background = document.createElementNS(SVG_NS, 'path');
  background.style.fill = 'rgb(255, 255, 255)';
  const foreignObject = document.createElementNS(SVG_NS, 'foreignObject');
  foreignObject.appendChild(document.createElement('div'));
  group.append(background, foreignObject);
  return group;
}

function makeNode(properties: Partial<NodeProperties> & { id: string }): Node {
  const node = new Node({ k: 1, parent: null, ...properties });
  node.dom = nodeDom();
  return node;
}

function makeMap() {
  const events = { call: jest.fn() };
  const history = { save: jest.fn() };
  const map = {
    rootId: 'root',
    options: { defaultNode: DefaultNodeValues },
    draw: { update: jest.fn(), clear: jest.fn() },
    events,
    history,
  } as unknown as MmpMap;

  const handler = new Nodes(map);
  map.nodes = handler;
  map.copyPaste = new CopyPaste(map);

  const root = makeNode({ id: 'root', isRoot: true });
  const branch = makeNode({
    id: 'branch',
    parent: root,
    coordinates: { x: 200, y: 0 },
  });
  const other = makeNode({
    id: 'other',
    parent: root,
    coordinates: { x: -200, y: 0 },
  });
  for (const node of [root, branch, other]) handler.setNode(node.id, node);

  return { map, handler, events, history, nodes: { root, branch, other } };
}

/** The event names mmp fired, in order. */
function firedEvents(events: { call: jest.Mock }): string[] {
  return events.call.mock.calls.map(call => call[0]);
}

describe('deselectNode', () => {
  it('leaves nothing selected when the main root is selected', () => {
    const { handler } = makeMap();
    handler.selectRootNode();

    handler.deselectNode();

    expect(handler.getSelectedNode()).toBeNull();
    expect(handler.selectNode()).toBeNull();
  });

  it('tells listeners which node lost the selection', () => {
    const { handler, events, nodes } = makeMap();
    handler.selectNode(nodes.branch.id);
    events.call.mockClear();

    handler.deselectNode();

    expect(events.call).toHaveBeenCalledWith(
      Event.nodeDeselect,
      nodes.branch.dom,
      expect.objectContaining({ id: nodes.branch.id })
    );
    expect(nodes.branch.getBackgroundDOM().style.stroke).toBe('');
  });

  it('fires nothing when nothing is selected', () => {
    const { handler, events } = makeMap();

    handler.deselectNode();

    expect(events.call).not.toHaveBeenCalled();
  });
});

describe('selectNode with nothing selected', () => {
  it('selects a node without a deselect event', () => {
    const { handler, events, nodes } = makeMap();

    const selected = handler.selectNode(nodes.branch.id);

    expect(selected?.id).toBe(nodes.branch.id);
    expect(handler.getSelectedNode()).toBe(nodes.branch);
    expect(firedEvents(events)).toEqual([Event.nodeSelect]);
  });

  it('ignores a direction', () => {
    const { handler, events } = makeMap();

    expect(handler.selectNode('left')).toBeNull();
    expect(handler.selectNode('up')).toBeNull();
    expect(events.call).not.toHaveBeenCalled();
  });
});

describe('selectNode from one node to another', () => {
  it('fires the deselect of the old node before the select of the new one', () => {
    const { handler, events, nodes } = makeMap();
    handler.selectNode(nodes.branch.id);
    events.call.mockClear();

    handler.selectNode(nodes.other.id);

    expect(events.call.mock.calls.map(call => [call[0], call[2].id])).toEqual([
      [Event.nodeDeselect, nodes.branch.id],
      [Event.nodeSelect, nodes.other.id],
    ]);
  });

  it('leaves nothing selected while the deselect listeners run', () => {
    const { handler, events, nodes } = makeMap();
    handler.selectNode(nodes.branch.id);
    const selectedDuringDeselect: (Node | null)[] = [];
    events.call.mockImplementation((event: string) => {
      if (event === Event.nodeDeselect) {
        selectedDuringDeselect.push(handler.getSelectedNode());
      }
    });

    handler.selectNode(nodes.other.id);

    expect(selectedDuringDeselect).toEqual([null]);
  });
});

describe('selectRootNode', () => {
  it('selects the main root after a deselect', () => {
    const { handler, nodes } = makeMap();
    handler.selectNode(nodes.branch.id);
    handler.deselectNode();

    handler.selectRootNode();

    expect(handler.getSelectedNode()).toBe(nodes.root);
  });
});

describe('operations on the selected node with nothing selected', () => {
  it('updates no node', () => {
    const { handler, history, nodes } = makeMap();

    handler.updateNode('fontWeight', 'bold');

    expect(nodes.branch.font.weight).not.toBe('bold');
    expect(history.save).not.toHaveBeenCalled();
  });

  it('removes no node', () => {
    const { handler, history } = makeMap();

    handler.removeNode();

    expect(handler.getNodes()).toHaveLength(3);
    expect(history.save).not.toHaveBeenCalled();
  });

  it('lists no children', () => {
    const { handler } = makeMap();

    expect(handler.nodeChildren()).toEqual([]);
  });

  it('throws when nothing is selected and no parent is named', () => {
    const { handler } = makeMap();

    expect(() => handler.addNode({}, false, false)).toThrow(
      'There is no selected node'
    );
    expect(handler.getNodes()).toHaveLength(3);
  });

  it('adds a child to a named parent', () => {
    const { handler, nodes } = makeMap();

    const added = handler.addNode({}, false, false, nodes.branch.id);

    expect(added.parent).toBe(nodes.branch);
  });

  it('copies, cuts and pastes nothing', () => {
    const { map, handler, events, nodes } = makeMap();
    map.copyPaste.copy(nodes.branch.id);

    map.copyPaste.copy();
    map.copyPaste.cut();
    map.copyPaste.paste();

    expect(handler.getNodes()).toHaveLength(3);
    expect(events.call).not.toHaveBeenCalled();
  });
});

describe('removeNode and the selection', () => {
  it('leaves nothing selected after removing the selected node', () => {
    const { handler, nodes } = makeMap();
    handler.selectNode(nodes.branch.id);

    handler.removeNode();

    expect(handler.existNode(nodes.branch.id)).toBe(false);
    expect(handler.getSelectedNode()).toBeNull();
  });

  it('leaves nothing selected after removing an ancestor of the selected node', () => {
    const { handler, nodes } = makeMap();
    const grandchild = makeNode({ id: 'grandchild', parent: nodes.branch });
    handler.setNode(grandchild.id, grandchild);
    handler.selectNode(grandchild.id);

    handler.removeNode(nodes.branch.id, false);

    expect(handler.existNode(grandchild.id)).toBe(false);
    expect(handler.getSelectedNode()).toBeNull();
  });

  it('keeps the selection when another node is removed', () => {
    const { handler, nodes } = makeMap();
    handler.selectNode(nodes.branch.id);

    handler.removeNode(nodes.other.id, false);

    expect(handler.getSelectedNode()).toBe(nodes.branch);
  });
});
