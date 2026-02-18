import * as Y from 'yjs';
import {
  populateYMapFromNodeProps,
  yMapToNodeProps,
  sortParentFirst,
} from './yjs-utils';
import { ExportNodeProperties } from '@mmp/map/types';

describe('YjsUndoManager', () => {
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

  function addRootNode(doc: Y.Doc, nodesMap: Y.Map<Y.Map<unknown>>): void {
    addNodeToMap(
      doc,
      nodesMap,
      {
        id: 'root',
        parent: undefined,
        isRoot: true,
        coordinates: { x: 0, y: 0 },
      },
      ORIGIN_IMPORT
    );
  }

  // ─── Origin filtering ────────────────────────────────────────

  describe('origin filtering', () => {
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

    it('captures local-origin transactions', () => {
      addNodeToMap(doc, nodesMap, { id: 'n1', name: 'Test' });

      expect(undoManager.undoStack.length).toBe(1);
    });

    it('ignores import-origin transactions', () => {
      addNodeToMap(doc, nodesMap, { id: 'root', isRoot: true }, ORIGIN_IMPORT);

      expect(undoManager.undoStack.length).toBe(0);
    });
  });

  // ─── Lifecycle ───────────────────────────────────────────────

  describe('lifecycle', () => {
    it('does not capture operations performed before creation', () => {
      const { doc, nodesMap } = createYjsContext();
      addNodeToMap(doc, nodesMap, { id: 'root', isRoot: true });

      const undoManager = createTrackedUndoManager(nodesMap);

      expect(undoManager.undoStack.length).toBe(0);
      undoManager.destroy();
      doc.destroy();
    });
  });

  // ─── Echo prevention ─────────────────────────────────────────

  describe('echo prevention', () => {
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

    it('filters local edits in observer', () => {
      undoManager = createTrackedUndoManager(nodesMap);
      const calls = observeWithFilter(undoManager);

      addNodeToMap(doc, nodesMap, { id: 'n1' });

      expect(calls).toEqual(['skipped']);
    });

    it('passes through UndoManager-originated edits', () => {
      addNodeToMap(doc, nodesMap, { id: 'n1' });
      undoManager = createTrackedUndoManager(nodesMap);
      addNodeToMap(doc, nodesMap, { id: 'n2' });

      const calls = observeWithFilter(undoManager);
      undoManager.undo();

      expect(calls).toEqual(['applied']);
    });

    it('passes through remote edits', () => {
      const remoteDoc = new Y.Doc();
      const remoteNodesMap = remoteDoc.getMap('nodes') as Y.Map<Y.Map<unknown>>;

      undoManager = createTrackedUndoManager(nodesMap);
      const calls = observeWithFilter(undoManager);

      remoteDoc.transact(() => {
        const yNode = new Y.Map<unknown>();
        populateYMapFromNodeProps(yNode, createMockNode({ id: 'r1' }));
        remoteNodesMap.set('r1', yNode);
      });

      Y.applyUpdate(doc, Y.encodeStateAsUpdate(remoteDoc));

      expect(calls).toEqual(['applied']);
      remoteDoc.destroy();
    });
  });

  // ─── canUndo/canRedo reactive state ──────────────────────────

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

    it('enables canUndo after edit', () => {
      addNodeToMap(doc, nodesMap, { id: 'n1' });

      expect({ canUndo, canRedo }).toEqual({
        canUndo: true,
        canRedo: false,
      });
    });

    it('enables canRedo after undo', () => {
      addNodeToMap(doc, nodesMap, { id: 'n1' });
      undoManager.undo();

      expect({ canUndo, canRedo }).toEqual({
        canUndo: false,
        canRedo: true,
      });
    });

    it('clears redo stack on new edit after undo', () => {
      addNodeToMap(doc, nodesMap, { id: 'n1' });
      undoManager.undo();
      addNodeToMap(doc, nodesMap, { id: 'n2' });

      expect({ canUndo, canRedo }).toEqual({
        canUndo: true,
        canRedo: false,
      });
    });
  });

  // ─── Undo/redo operations ────────────────────────────────────

  describe('undo/redo operations', () => {
    let doc: Y.Doc;
    let nodesMap: Y.Map<Y.Map<unknown>>;
    let undoManager: Y.UndoManager;

    beforeEach(() => {
      ({ doc, nodesMap } = createYjsContext());
      addRootNode(doc, nodesMap);
      undoManager = createTrackedUndoManager(nodesMap);
    });

    afterEach(() => {
      undoManager.destroy();
      doc.destroy();
    });

    it('undo removes a created node', () => {
      addNodeToMap(doc, nodesMap, {
        id: 'n1',
        name: 'Test',
        coordinates: { x: 200, y: -120 },
      });

      undoManager.undo();

      expect(nodesMap.has('n1')).toBe(false);
    });

    it('redo restores an undone node with its properties', () => {
      const coords = { x: 200, y: -120 };
      addNodeToMap(doc, nodesMap, {
        id: 'n1',
        name: 'Test',
        coordinates: coords,
      });
      undoManager.undo();

      undoManager.redo();

      expect(yMapToNodeProps(nodesMap.get('n1')!)).toEqual(
        expect.objectContaining({
          id: 'n1',
          name: 'Test',
          coordinates: coords,
        })
      );
    });

    it('undo restores a deleted node with its coordinates', () => {
      const coords = { x: 200, y: -120 };
      addNodeToMap(doc, nodesMap, {
        id: 'n1',
        parent: 'root',
        coordinates: coords,
      });
      undoManager.stopCapturing();
      doc.transact(() => nodesMap.delete('n1'), ORIGIN_LOCAL);

      undoManager.undo();

      expect(yMapToNodeProps(nodesMap.get('n1')!)).toEqual(
        expect.objectContaining({ id: 'n1', coordinates: coords })
      );
    });

    it('batches subtree deletion into a single stack item', () => {
      addNodeToMap(doc, nodesMap, {
        id: 'A',
        parent: 'root',
        coordinates: { x: 200, y: -120 },
      });
      addNodeToMap(doc, nodesMap, {
        id: 'B',
        parent: 'A',
        coordinates: { x: 400, y: -80 },
      });
      undoManager.stopCapturing();
      const stackBefore = undoManager.undoStack.length;

      doc.transact(() => {
        nodesMap.delete('A');
        nodesMap.delete('B');
      }, ORIGIN_LOCAL);

      expect(undoManager.undoStack.length).toBe(stackBefore + 1);
    });

    it('undo restores a deleted subtree with coordinates', () => {
      const coordsA = { x: 200, y: -120 };
      const coordsB = { x: 400, y: -80 };
      addNodeToMap(doc, nodesMap, {
        id: 'A',
        parent: 'root',
        coordinates: coordsA,
      });
      addNodeToMap(doc, nodesMap, {
        id: 'B',
        parent: 'A',
        coordinates: coordsB,
      });
      undoManager.stopCapturing();
      doc.transact(() => {
        nodesMap.delete('A');
        nodesMap.delete('B');
      }, ORIGIN_LOCAL);

      undoManager.undo();

      expect({
        size: nodesMap.size,
        A: yMapToNodeProps(nodesMap.get('A')!).coordinates,
        B: yMapToNodeProps(nodesMap.get('B')!).coordinates,
      }).toEqual({ size: 3, A: coordsA, B: coordsB });
    });
  });

  // ─── sortParentFirst ─────────────────────────────────────────

  describe('sortParentFirst', () => {
    it('sorts deep hierarchy in parent-first order', () => {
      const nodes = [
        createMockNode({ id: 'gc', parent: 'child' }),
        createMockNode({ id: 'child', parent: 'parent' }),
        createMockNode({ id: 'root', parent: undefined, isRoot: true }),
        createMockNode({ id: 'parent', parent: 'root' }),
      ];

      const ids = sortParentFirst(nodes).map(n => n.id);

      expect(ids).toEqual(['root', 'parent', 'child', 'gc']);
    });
  });
});
