import * as Y from 'yjs';
import { populateYMapFromNodeProps, yMapToNodeProps } from './yjs-utils';
import { ExportNodeProperties } from '@mmp/map/types';

const ORIGIN_LOCAL = 'local';
const ORIGIN_IMPORT = 'import';

function createMockNode(
  overrides?: Partial<ExportNodeProperties>
): ExportNodeProperties {
  return {
    id: 'mock-id',
    name: 'Mock Node',
    parent: 'root',
    k: 1,
    colors: { branch: '#000000' },
    font: { size: 14, style: 'normal', weight: 'normal' },
    locked: false,
    hidden: false,
    coordinates: undefined,
    image: undefined,
    link: undefined,
    isRoot: false,
    detached: false,
    ...overrides,
  };
}

function createYjsContext() {
  const doc = new Y.Doc();
  const nodesMap = doc.getMap('nodes') as Y.Map<Y.Map<unknown>>;
  return { doc, nodesMap };
}

function createTrackedUndoManager(scope: Y.Map<unknown>): Y.UndoManager {
  return new Y.UndoManager(scope, {
    trackedOrigins: new Set([ORIGIN_LOCAL]),
  });
}

function addNodeToMap(
  doc: Y.Doc,
  nodesMap: Y.Map<Y.Map<unknown>>,
  nodeOverrides: Partial<ExportNodeProperties>,
  origin: string = ORIGIN_LOCAL
): void {
  doc.transact(() => {
    const yNode = new Y.Map<unknown>();
    populateYMapFromNodeProps(yNode, createMockNode(nodeOverrides));
    nodesMap.set(nodeOverrides.id!, yNode);
  }, origin);
}

// ─── Transaction origin tests ───────────────────────────────

describe('transaction origins on write operations', () => {
  let doc: Y.Doc;
  let nodesMap: Y.Map<Y.Map<unknown>>;
  let undoManager: Y.UndoManager;

  beforeEach(() => {
    ({ doc, nodesMap } = createYjsContext());
  });

  afterEach(() => {
    undoManager?.destroy();
    doc.destroy();
  });

  it('writeNodeCreate with local origin is captured by UndoManager', () => {
    undoManager = createTrackedUndoManager(nodesMap);
    addNodeToMap(doc, nodesMap, { id: 'n1', name: 'Test' });

    expect(undoManager.undoStack.length).toBe(1);
  });

  it('writeNodeUpdate with local origin is captured by UndoManager', () => {
    const yNode = new Y.Map<unknown>();
    populateYMapFromNodeProps(yNode, createMockNode({ id: 'n1' }));
    nodesMap.set('n1', yNode);

    undoManager = createTrackedUndoManager(nodesMap);

    doc.transact(() => {
      yNode.set('name', 'Updated');
    }, ORIGIN_LOCAL);

    expect(undoManager.undoStack.length).toBe(1);
  });

  it('writeNodeRemove with local origin is captured by UndoManager', () => {
    const yNode = new Y.Map<unknown>();
    populateYMapFromNodeProps(yNode, createMockNode({ id: 'n1' }));
    nodesMap.set('n1', yNode);

    undoManager = createTrackedUndoManager(nodesMap);

    doc.transact(() => {
      nodesMap.delete('n1');
    }, ORIGIN_LOCAL);

    expect(undoManager.undoStack.length).toBe(1);
  });

  it('writeNodesPaste with local origin is captured by UndoManager', () => {
    undoManager = createTrackedUndoManager(nodesMap);

    doc.transact(() => {
      for (const node of [
        createMockNode({ id: 'p1' }),
        createMockNode({ id: 'p2' }),
      ]) {
        const yNode = new Y.Map<unknown>();
        populateYMapFromNodeProps(yNode, node);
        nodesMap.set(node.id, yNode);
      }
    }, ORIGIN_LOCAL);

    expect(undoManager.undoStack.length).toBe(1);
  });

  it('writeMapOptions with local origin is captured', () => {
    const optionsMap = doc.getMap('mapOptions');
    undoManager = createTrackedUndoManager(optionsMap);

    doc.transact(() => {
      optionsMap.set('fontMaxSize', 28);
      optionsMap.set('fontMinSize', 6);
      optionsMap.set('fontIncrement', 2);
    }, ORIGIN_LOCAL);

    expect(undoManager.undoStack.length).toBe(1);
  });

  it('writeImport with import origin is NOT captured', () => {
    undoManager = createTrackedUndoManager(nodesMap);
    addNodeToMap(doc, nodesMap, { id: 'root', isRoot: true }, ORIGIN_IMPORT);

    expect(undoManager.undoStack.length).toBe(0);
  });
});

// ─── Lifecycle tests ────────────────────────────────────────

describe('Y.UndoManager lifecycle', () => {
  let doc: Y.Doc;
  let nodesMap: Y.Map<Y.Map<unknown>>;
  let undoManager: Y.UndoManager;

  beforeEach(() => {
    ({ doc, nodesMap } = createYjsContext());
  });

  afterEach(() => {
    undoManager?.destroy();
    doc.destroy();
  });

  it('undo and redo stacks are empty after creation', () => {
    undoManager = createTrackedUndoManager(nodesMap);

    expect({
      undoStack: undoManager.undoStack.length,
      redoStack: undoManager.redoStack.length,
    }).toEqual({ undoStack: 0, redoStack: 0 });
  });

  it('does not capture operations before creation', () => {
    addNodeToMap(doc, nodesMap, { id: 'root', isRoot: true });
    undoManager = createTrackedUndoManager(nodesMap);

    expect(undoManager.undoStack.length).toBe(0);
  });

  it('stops tracking after destroy', () => {
    undoManager = createTrackedUndoManager(nodesMap);
    addNodeToMap(doc, nodesMap, { id: 'n1' });
    expect(undoManager.undoStack.length).toBe(1);

    undoManager.destroy();
    addNodeToMap(doc, nodesMap, { id: 'n2' });

    expect(undoManager.undoStack.length).toBe(1);
  });
});

// ─── Echo prevention tests ──────────────────────────────────

describe('echo prevention with UndoManager origin', () => {
  let doc: Y.Doc;
  let nodesMap: Y.Map<Y.Map<unknown>>;
  let undoManager: Y.UndoManager;

  beforeEach(() => {
    ({ doc, nodesMap } = createYjsContext());
  });

  afterEach(() => {
    undoManager?.destroy();
    doc.destroy();
  });

  function observeWithFilter(um: Y.UndoManager): string[] {
    const calls: string[] = [];
    nodesMap.observeDeep((_events, transaction) => {
      if (transaction.local && transaction.origin !== um) {
        calls.push('skipped');
        return;
      }
      calls.push('applied');
    });
    return calls;
  }

  it('local edit with local origin is skipped', () => {
    undoManager = createTrackedUndoManager(nodesMap);
    const calls = observeWithFilter(undoManager);

    addNodeToMap(doc, nodesMap, { id: 'n1' });

    expect(calls).toEqual(['skipped']);
  });

  it('UndoManager-originated edit passes through', () => {
    addNodeToMap(doc, nodesMap, { id: 'n1' });
    undoManager = createTrackedUndoManager(nodesMap);
    addNodeToMap(doc, nodesMap, { id: 'n2' });

    const calls = observeWithFilter(undoManager);
    undoManager.undo();

    expect(calls).toEqual(['applied']);
  });

  it('remote edit passes through', () => {
    const remoteDoc = new Y.Doc();
    const remoteNodesMap = remoteDoc.getMap('nodes') as Y.Map<Y.Map<unknown>>;

    undoManager = createTrackedUndoManager(nodesMap);
    const calls = observeWithFilter(undoManager);

    remoteDoc.transact(() => {
      const yNode = new Y.Map<unknown>();
      populateYMapFromNodeProps(yNode, createMockNode({ id: 'r1' }));
      remoteNodesMap.set('r1', yNode);
    });

    const update = Y.encodeStateAsUpdate(remoteDoc);
    Y.applyUpdate(doc, update);

    expect(calls).toEqual(['applied']);
    remoteDoc.destroy();
  });
});

// ─── canUndo/canRedo reactive state tests ───────────────────

describe('canUndo/canRedo reactive state', () => {
  let doc: Y.Doc;
  let nodesMap: Y.Map<Y.Map<unknown>>;
  let undoManager: Y.UndoManager;
  let canUndo: boolean;
  let canRedo: boolean;

  beforeEach(() => {
    ({ doc, nodesMap } = createYjsContext());
    undoManager = createTrackedUndoManager(nodesMap);
    canUndo = false;
    canRedo = false;

    const updateState = () => {
      canUndo = undoManager.undoStack.length > 0;
      canRedo = undoManager.redoStack.length > 0;
    };
    undoManager.on('stack-item-added', updateState);
    undoManager.on('stack-item-popped', updateState);
  });

  afterEach(() => {
    undoManager.destroy();
    doc.destroy();
  });

  it('initial state: both false', () => {
    expect({ canUndo, canRedo }).toEqual({
      canUndo: false,
      canRedo: false,
    });
  });

  it('after edit: canUndo=true, canRedo=false', () => {
    addNodeToMap(doc, nodesMap, { id: 'n1' });

    expect({ canUndo, canRedo }).toEqual({
      canUndo: true,
      canRedo: false,
    });
  });

  it('after undo: canUndo=false, canRedo=true', () => {
    addNodeToMap(doc, nodesMap, { id: 'n1' });
    undoManager.undo();

    expect({ canUndo, canRedo }).toEqual({
      canUndo: false,
      canRedo: true,
    });
  });

  it('after redo: canUndo=true, canRedo=false', () => {
    addNodeToMap(doc, nodesMap, { id: 'n1' });
    undoManager.undo();
    undoManager.redo();

    expect({ canUndo, canRedo }).toEqual({
      canUndo: true,
      canRedo: false,
    });
  });

  it('new edit after undo clears redo stack', () => {
    addNodeToMap(doc, nodesMap, { id: 'n1' });
    undoManager.undo();
    addNodeToMap(doc, nodesMap, { id: 'n2' });

    expect({ canUndo, canRedo }).toEqual({
      canUndo: true,
      canRedo: false,
    });
  });
});

// ─── Integration tests ──────────────────────────────────────

describe('Y.UndoManager integration', () => {
  let doc: Y.Doc;
  let nodesMap: Y.Map<Y.Map<unknown>>;
  let undoManager: Y.UndoManager;

  beforeEach(() => {
    ({ doc, nodesMap } = createYjsContext());
    undoManager = createTrackedUndoManager(nodesMap);
  });

  afterEach(() => {
    undoManager.destroy();
    doc.destroy();
  });

  it('create node, undo removes it', () => {
    addNodeToMap(doc, nodesMap, { id: 'n1', name: 'Test Node' });
    expect(nodesMap.size).toBe(1);

    undoManager.undo();
    expect(nodesMap.size).toBe(0);
  });

  it('redo after undo restores the node', () => {
    addNodeToMap(doc, nodesMap, { id: 'n1', name: 'Test Node' });
    undoManager.undo();
    undoManager.redo();

    expect(nodesMap.size).toBe(1);
    expect(yMapToNodeProps(nodesMap.get('n1')!).name).toBe('Test Node');
  });

  it('undo after import is no-op', () => {
    addNodeToMap(doc, nodesMap, { id: 'root', isRoot: true }, ORIGIN_IMPORT);

    undoManager.undo();
    expect(nodesMap.size).toBe(1);
  });

  it('stack state: initially both empty', () => {
    expect({
      canUndo: undoManager.undoStack.length > 0,
      canRedo: undoManager.redoStack.length > 0,
    }).toEqual({ canUndo: false, canRedo: false });
  });

  it('stack state: after edit undo enabled', () => {
    addNodeToMap(doc, nodesMap, { id: 'n1' });

    expect({
      canUndo: undoManager.undoStack.length > 0,
      canRedo: undoManager.redoStack.length > 0,
    }).toEqual({ canUndo: true, canRedo: false });
  });

  it('stack state: after undo redo enabled', () => {
    addNodeToMap(doc, nodesMap, { id: 'n1' });
    undoManager.undo();

    expect({
      canUndo: undoManager.undoStack.length > 0,
      canRedo: undoManager.redoStack.length > 0,
    }).toEqual({ canUndo: false, canRedo: true });
  });
});
