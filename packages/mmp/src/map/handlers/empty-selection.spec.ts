import { firedEvents, nodeRecord, stubMap } from '../../test/stub-map.js';
import type { ExportNodeProperties, MapSnapshot } from '@teammapper/shared';

/**
 * Deselecting leaves no node selected, the main root included. With nothing
 * selected, the operations that act on the selected node do nothing, and a
 * map load selects the main root again.
 */

const COLORS = { background: '#ffffff' };

/** root -> branch, root -> other, with nothing selected. */
function makeMap(extra: MapSnapshot = []) {
  const stub = stubMap([
    nodeRecord({ id: 'root', isRoot: true, colors: COLORS }),
    nodeRecord({
      id: 'branch',
      parent: 'root',
      coordinates: { x: 200, y: 0 },
      colors: COLORS,
    }),
    nodeRecord({
      id: 'other',
      parent: 'root',
      coordinates: { x: -200, y: 0 },
      colors: COLORS,
    }),
    ...extra,
  ]);
  stub.nodes.deselectNode();
  stub.events.emit.mockClear();

  return { ...stub, handler: stub.nodes };
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
    const { map, handler, events } = makeMap();
    handler.selectNode('branch');
    events.emit.mockClear();

    handler.deselectNode();

    expect(events.emit).toHaveBeenCalledWith(
      'nodeDeselect',
      expect.objectContaining({ id: 'branch' })
    );
    expect(map.draw.ringOf('branch')).toBeNull();
  });

  it('fires nothing when nothing is selected', () => {
    const { handler, events } = makeMap();

    handler.deselectNode();

    expect(events.emit).not.toHaveBeenCalled();
  });
});

describe('selectNode with nothing selected', () => {
  it('selects a node without a deselect event', () => {
    const { handler, events } = makeMap();

    const selected = handler.selectNode('branch');

    expect(selected?.id).toBe('branch');
    expect(handler.getSelectedNode()?.id).toBe('branch');
    expect(firedEvents(events)).toEqual(['nodeSelect']);
  });

  it('ignores a direction', () => {
    const { handler, events } = makeMap();

    expect(handler.selectNode('left')).toBeNull();
    expect(handler.selectNode('up')).toBeNull();
    expect(events.emit).not.toHaveBeenCalled();
  });
});

describe('selectNode from one node to another', () => {
  it('fires the deselect of the old node before the select of the new one', () => {
    const { handler, events } = makeMap();
    handler.selectNode('branch');
    events.emit.mockClear();

    handler.selectNode('other');

    expect(events.emit.mock.calls.map(call => [call[0], call[1].id])).toEqual([
      ['nodeDeselect', 'branch'],
      ['nodeSelect', 'other'],
    ]);
  });

  it('leaves nothing selected while the deselect listeners run', () => {
    const { handler, events } = makeMap();
    handler.selectNode('branch');
    const selectedDuringDeselect: (ExportNodeProperties | null)[] = [];
    events.emit.mockImplementation((event: string) => {
      if (event === 'nodeDeselect') {
        selectedDuringDeselect.push(handler.getSelectedNode());
      }
    });

    handler.selectNode('other');

    expect(selectedDuringDeselect).toEqual([null]);
  });
});

describe('selectRootNode', () => {
  it('selects the main root after a deselect', () => {
    const { handler } = makeMap();
    handler.selectNode('branch');
    handler.deselectNode();

    handler.selectRootNode();

    expect(handler.getSelectedNode()?.id).toBe('root');
  });
});

describe('operations on the selected node with nothing selected', () => {
  it('updates no node', () => {
    const { handler, data, events } = makeMap();

    handler.updateNode('fontWeight', 'bold');

    expect(data.node('branch')?.font?.weight).not.toBe('bold');
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('removes no node', () => {
    const { handler, data, events } = makeMap();

    handler.removeNode();

    expect(data.nodes()).toHaveLength(3);
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('lists no children', () => {
    const { handler } = makeMap();

    expect(handler.nodeChildren()).toEqual([]);
  });

  it('throws when nothing is selected and no parent is named', () => {
    const { handler, data } = makeMap();

    expect(() => handler.addNode({})).toThrow('There is no selected node');
    expect(data.nodes()).toHaveLength(3);
  });

  it('adds a child to a named parent', () => {
    const { handler } = makeMap();

    const added = handler.addNode({}, 'branch');

    expect(added?.parent).toBe('branch');
  });

  it('copies, cuts and pastes nothing', () => {
    const { map, data, events } = makeMap();
    map.copyPaste.copy('branch');

    map.copyPaste.copy();
    map.copyPaste.cut();
    map.copyPaste.paste();

    expect(data.nodes()).toHaveLength(3);
    expect(events.emit).not.toHaveBeenCalled();
  });
});

describe('removeNode and the selection', () => {
  it('leaves nothing selected after removing the selected node', () => {
    const { handler } = makeMap();
    handler.selectNode('branch');

    handler.removeNode();

    expect(handler.existNode('branch')).toBe(false);
    expect(handler.getSelectedNode()).toBeNull();
  });

  it('leaves nothing selected after removing an ancestor of the selected node', () => {
    const { handler } = makeMap([
      nodeRecord({ id: 'grandchild', parent: 'branch', colors: COLORS }),
    ]);
    handler.selectNode('grandchild');

    handler.removeNode('branch');

    expect(handler.existNode('grandchild')).toBe(false);
    expect(handler.getSelectedNode()).toBeNull();
  });

  it('keeps the selection when another node is removed', () => {
    const { handler } = makeMap();
    handler.selectNode('branch');

    handler.removeNode('other');

    expect(handler.getSelectedNode()?.id).toBe('branch');
  });
});
