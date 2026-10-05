import { YjsSyncService } from './yjs-sync.service';
import * as Y from 'yjs';
import { ExportNodeProperties } from '@teammapper/shared';
import { MmpService } from '../mmp/mmp.service';
import { SettingsService } from '../settings/settings.service';
import { MapSyncContext } from './map-sync-context';
import { populateYMapFromNodeProps } from './yjs-utils';
import {
  capturingMmpService,
  createMockContext,
  createYjsSyncService as createService,
  MmpHandlers,
} from '../../../../test/mocks/yjs-sync.mock';

interface YjsSyncInternals {
  yjsWritable: boolean;
  yjsSynced: boolean;
  yDoc: Y.Doc;
  handleTopLevelNodeChanges: (
    event: unknown,
    nodesMap: Y.Map<Y.Map<unknown>>
  ) => void;
  showImportToast: () => Promise<void>;
  loadMapFromYDoc: () => void;
  handleFirstSync: () => void;
  createListeners: () => void;
  initUndoManager: () => void;
  setupNodesObserver: () => void;
  yUndoManager: Y.UndoManager | null;
}

function internals(service: YjsSyncService): YjsSyncInternals {
  return service as unknown as YjsSyncInternals;
}

describe('YjsSyncService', () => {
  describe('setWritable', () => {
    let settingsService: jest.Mocked<SettingsService>;
    let service: YjsSyncService;

    beforeEach(() => {
      settingsService = {
        setEditMode: jest.fn(),
      } as unknown as jest.Mocked<SettingsService>;
      service = createService(undefined, createMockContext(), settingsService);
    });

    it('sets yjsWritable to true', () => {
      service.setWritable(true);

      expect(internals(service).yjsWritable).toBe(true);
    });

    it('sets yjsWritable to false', () => {
      service.setWritable(false);

      expect(internals(service).yjsWritable).toBe(false);
    });

    it('does not change edit mode before the first sync', () => {
      service.setWritable(true);

      expect(settingsService.setEditMode).not.toHaveBeenCalled();
    });

    it('sets edit mode when called after the first sync', () => {
      internals(service).yjsSynced = true;

      service.setWritable(true);

      expect(settingsService.setEditMode).toHaveBeenCalledWith(true);
    });

    // The settings page reads edit mode to decide whether the map settings
    // of the map the user left stay editable.
    it('keeps edit mode on destroy', () => {
      service.destroy();

      expect(settingsService.setEditMode).not.toHaveBeenCalled();
    });

    it('keeps edit mode when it opens a new connection', () => {
      service.initMap('test-uuid');

      expect(settingsService.setEditMode).not.toHaveBeenCalled();
      service.destroy();
    });
  });

  describe('with an open connection', () => {
    let handlers: MmpHandlers;
    let mmpService: jest.Mocked<MmpService>;
    let context: MapSyncContext;
    let settingsService: jest.Mocked<SettingsService>;
    let service: YjsSyncService;

    beforeEach(() => {
      handlers = {};
      mmpService = {
        ...capturingMmpService(handlers),
        new: jest.fn(),
      } as unknown as jest.Mocked<MmpService>;
      context = createMockContext();
      settingsService = {
        setEditMode: jest.fn(),
      } as unknown as jest.Mocked<SettingsService>;
      service = createService(mmpService, context, settingsService);
      service.initMap('test-uuid');
    });

    afterEach(() => {
      service.destroy();
    });

    it('defines the meta map before the first sync', () => {
      expect(internals(service).yDoc.share.get('meta')).toBeInstanceOf(Y.Map);
    });

    it('asks for the map on the first sync, an empty doc included', () => {
      internals(service).handleFirstSync();

      expect(context.setConnectionStatus).toHaveBeenLastCalledWith('connected');
      expect(context.createMap).toHaveBeenCalledTimes(1);
    });

    it('subscribes to no mmp event before the map exists', () => {
      internals(service).handleFirstSync();

      expect(mmpService.on).not.toHaveBeenCalled();
    });

    it('asks for the map again when a map component reattaches', () => {
      internals(service).yjsSynced = true;

      service.initMap('test-uuid');

      expect(context.createMap).toHaveBeenCalledTimes(1);
    });

    it('asks for no map on a reattach before the first sync', () => {
      service.initMap('test-uuid');

      expect(context.createMap).not.toHaveBeenCalled();
    });

    describe('attachMap', () => {
      const root = { id: 'root', parent: null, isRoot: true, name: 'Root' };

      beforeEach(() => {
        const doc = internals(service).yDoc;
        const yNode = new Y.Map<unknown>();
        doc.getMap('nodes').set('root', yNode);
        populateYMapFromNodeProps(yNode, root as ExportNodeProperties);
        mmpService.selectNode.mockReturnValue(root as ExportNodeProperties);
        service.setWritable(true);
        internals(service).handleFirstSync();
        service.attachMap();
      });

      it('loads the Y.Doc into the map without events before it subscribes', () => {
        expect(mmpService.new).toHaveBeenCalledWith(
          [expect.objectContaining({ id: 'root', isRoot: true })],
          false
        );
        expect(mmpService.new.mock.invocationCallOrder[0]).toBeLessThan(
          mmpService.on.mock.invocationCallOrder[0]
        );
      });

      it('subscribes to the mmp events', () => {
        expect(Object.keys(handlers).sort()).toEqual([
          'create',
          'distribute',
          'nodeCreate',
          'nodeDeselect',
          'nodePaste',
          'nodeRemove',
          'nodeSelect',
          'nodeUpdate',
        ]);
      });

      it('attaches the node the map selected when it was created', () => {
        expect(context.setAttachedNode).toHaveBeenLastCalledWith(root);
      });

      it('creates the undo manager', () => {
        expect(internals(service).yUndoManager).not.toBeNull();
      });

      it('sets edit mode after awareness is up', () => {
        const awarenessOrder = (context.setClientColor as jest.Mock).mock
          .invocationCallOrder[0];
        const editModeOrder =
          settingsService.setEditMode.mock.invocationCallOrder[0];

        expect(settingsService.setEditMode).toHaveBeenCalledWith(true);
        expect(editModeOrder).toBeGreaterThan(awarenessOrder);
      });
    });
  });

  describe('initMap does not alter writable state', () => {
    let service: YjsSyncService;

    beforeEach(() => {
      service = createService();
    });

    afterEach(() => {
      service.destroy();
    });

    it('does not reset yjsWritable when called', () => {
      service.setWritable(true);
      service.initMap('test-uuid');

      expect(internals(service).yjsWritable).toBe(true);
    });

    it('creates a new yDoc', () => {
      service.initMap('test-uuid');

      expect(internals(service).yDoc).not.toBeNull();
    });

    it('retains writable after destroy-setWritable-initMap sequence', () => {
      service.destroy();
      service.setWritable(true);
      service.initMap('test-uuid');

      expect(internals(service).yjsWritable).toBe(true);
    });
  });

  describe('distributing nodes', () => {
    const snapshot = [
      { id: 'root', parent: '', isRoot: true },
      { id: 'child', parent: 'root', isRoot: false },
    ] as ExportNodeProperties[];

    let handlers: MmpHandlers;
    let service: YjsSyncService;
    let context: MapSyncContext;

    beforeEach(() => {
      handlers = {};
      context = createMockContext();
      const mmpService = {
        ...capturingMmpService(handlers),
        exportAsJSON: jest.fn().mockReturnValue(snapshot),
      } as unknown as jest.Mocked<MmpService>;
      service = createService(mmpService, context);
      service.initMap('test-uuid');
      // attachMap subscribes once the map exists; these tests need only the
      // listeners.
      internals(service).createListeners();
      internals(service).yjsSynced = true;
      // Normally created by handleFirstSync, which needs a live websocket.
      internals(service).initUndoManager();
    });

    afterEach(() => {
      service.destroy();
    });

    it('subscribes to the mmp distribute event', () => {
      expect(Object.keys(handlers)).toContain('distribute');
    });

    it('writes every node to the doc when a distribute happens', () => {
      handlers['distribute']();

      const nodesMap = internals(service).yDoc.getMap('nodes');
      expect(Array.from(nodesMap.keys()).sort()).toEqual(['child', 'root']);
    });

    it('refreshes the cached map so it does not keep the old coordinates', () => {
      handlers['distribute']();

      expect(context.updateAttachedMap).toHaveBeenCalled();
    });

    it('records the replacement as a distribute so peers can identify it', () => {
      handlers['distribute']();

      expect(
        internals(service).yDoc.getMap('meta').get('lastMapAnnouncement')
      ).toBe('distribute');
    });

    it('still records an import as an import', () => {
      handlers['create']();

      expect(
        internals(service).yDoc.getMap('meta').get('lastMapAnnouncement')
      ).toBe('import');
    });

    // Lay a root node down as a local edit, so the undo manager has a state
    // to return to.
    function seedRootNode(id: string): Y.Map<Y.Map<unknown>> {
      const doc = internals(service).yDoc;
      const nodesMap = doc.getMap('nodes') as Y.Map<Y.Map<unknown>>;
      doc.transact(() => {
        const yNode = new Y.Map<unknown>();
        nodesMap.set(id, yNode);
        yNode.set('id', id);
        yNode.set('isRoot', true);
        yNode.set('coordinates', { x: 5, y: 5 });
      }, 'local');

      return nodesMap;
    }

    it('makes an import undoable', () => {
      const nodesMap = seedRootNode('before-import');

      handlers['create']();
      service.undo();

      expect({
        ids: Array.from(nodesMap.keys()),
        coordinates: nodesMap.get('before-import')?.get('coordinates'),
      }).toEqual({
        ids: ['before-import'],
        coordinates: { x: 5, y: 5 },
      });
    });

    // The import is sealed off from the edit before it, so reaching that edit
    // takes a second press rather than being swept up in the first.
    it('needs a second undo to reach the edit before the import', () => {
      const nodesMap = seedRootNode('before-import');

      handlers['create']();
      service.undo();
      service.undo();

      expect(Array.from(nodesMap.keys())).toEqual([]);
    });

    it('makes a distribute undoable', () => {
      const nodesMap = seedRootNode('root');

      handlers['distribute']();
      service.undo();

      expect(nodesMap.get('root')?.get('coordinates')).toEqual({ x: 5, y: 5 });
    });

    it('sends a branch protection as one update that one undo reverts', () => {
      const doc = internals(service).yDoc;
      const nodesMap = seedRootNode('root');
      seedRootNode('child');
      const updates = jest.fn();
      doc.on('update', updates);

      service.transactLocally(() => {
        for (const [id, flag] of [
          ['child', false],
          ['root', true],
        ] as const) {
          handlers['nodeUpdate']({
            nodeProperties: { id, protected: flag },
            changedProperty: 'protected',
          });
        }
      });
      const updatesSent = updates.mock.calls.length;
      service.undo();

      expect({
        updatesSent,
        root: nodesMap.get('root')?.get('protected'),
        child: nodesMap.get('child')?.get('protected'),
      }).toEqual({ updatesSent: 1, root: undefined, child: undefined });
    });

    describe('on a receiving client', () => {
      let nodesMap: Y.Map<Y.Map<unknown>>;
      let importToast: jest.SpyInstance;

      beforeEach(() => {
        const doc = internals(service).yDoc;
        nodesMap = doc.getMap('nodes') as Y.Map<Y.Map<unknown>>;
        const yNode = new Y.Map<unknown>();
        nodesMap.set('root', yNode);
        yNode.set('isRoot', true);

        importToast = jest
          .spyOn(internals(service), 'showImportToast')
          .mockResolvedValue(undefined);
        jest
          .spyOn(internals(service), 'loadMapFromYDoc')
          .mockImplementation(() => undefined);
      });

      /**
       * Feed the service a full-map replacement. `metaKeys` are the meta keys
       * the transaction wrote - an announcement, or nothing for an undo replay;
       * `local` marks it as our own undo rather than a peer's replacement.
       */
      function receiveReplacement({
        metaKeys = ['lastMapAnnouncement'],
        local = false,
      }: { metaKeys?: string[]; local?: boolean } = {}): void {
        const changed = new Map<unknown, Set<string>>();
        if (metaKeys.length > 0) {
          changed.set(
            internals(service).yDoc.getMap('meta'),
            new Set(metaKeys)
          );
        }

        internals(service).handleTopLevelNodeChanges(
          {
            changes: { keys: new Map([['root', { action: 'add' }]]) },
            keysChanged: new Set(['root']),
            transaction: { changed, local },
          },
          nodesMap
        );
      }

      function setLastOperation(operation: string): void {
        internals(service)
          .yDoc.getMap('meta')
          .set('lastMapAnnouncement', operation);
      }

      it('does not show the import toast for a redistribution', () => {
        setLastOperation('distribute');

        receiveReplacement();

        expect(importToast).not.toHaveBeenCalled();
      });

      // An undo replays nodes without recording an operation, so the stale
      // 'import' left in the meta map must not make it announce one.
      it('does not show the import toast when an import is undone', () => {
        setLastOperation('import');

        receiveReplacement({ metaKeys: [] });

        expect(importToast).not.toHaveBeenCalled();
      });

      it('does not show the import toast when a distribute is undone', () => {
        setLastOperation('distribute');

        receiveReplacement({ metaKeys: [] });

        expect(importToast).not.toHaveBeenCalled();
      });

      // A replacement cannot be merged as a replacement, so undoing into a
      // map a peer has already replaced would leave two roots behind.
      it('drops the undo history when a peer replaces the map', () => {
        seedRootNode('mine');

        receiveReplacement();

        expect(internals(service).yUndoManager?.undoStack.length).toBe(0);
      });

      // Clearing the stack has to reach the toolbar, or undo stays enabled
      // with nothing left to undo.
      it('reports that there is nothing left to undo', () => {
        seedRootNode('mine');

        receiveReplacement();

        expect(context.setCanUndo).toHaveBeenLastCalledWith(false);
      });

      it('keeps the history when the replacement is our own undo', () => {
        seedRootNode('mine');

        receiveReplacement({ metaKeys: [], local: true });

        expect(internals(service).yUndoManager?.undoStack.length).toBe(1);
      });

      // The announcement is read per key, so `meta` gaining unrelated fields
      // later must not turn every replacement into an import.
      it('does not show the import toast for an unrelated meta write', () => {
        setLastOperation('import');

        receiveReplacement({ metaKeys: ['someOtherField'] });

        expect(importToast).not.toHaveBeenCalled();
      });

      it('still shows the import toast for an actual import', () => {
        setLastOperation('import');

        receiveReplacement();

        expect(importToast).toHaveBeenCalled();
      });
    });
  });

  describe('receiving trees from a peer', () => {
    let service: YjsSyncService;
    let mmpService: jest.Mocked<MmpService>;
    let peer: Y.Doc;
    let loadMap: jest.SpyInstance;

    function receivingMmpService(): jest.Mocked<MmpService> {
      return {
        on: jest.fn().mockReturnValue({
          subscribe: jest.fn().mockReturnValue({ unsubscribe: jest.fn() }),
        }),
        existNode: jest.fn().mockReturnValue(false),
        addNodesFromServer: jest.fn(),
        removeNode: jest.fn(),
      } as unknown as jest.Mocked<MmpService>;
    }

    function node(
      id: string,
      parent: string | null,
      isRoot = false
    ): ExportNodeProperties {
      return { id, parent, isRoot } as ExportNodeProperties;
    }

    function writeNodes(
      nodesMap: Y.Map<Y.Map<unknown>>,
      nodes: ExportNodeProperties[]
    ): void {
      for (const props of nodes) {
        const yNode = new Y.Map<unknown>();
        populateYMapFromNodeProps(yNode, props);
        nodesMap.set(props.id, yNode);
      }
    }

    /**
     * Runs `change` in a transaction on the peer's `Y.Doc` and applies the
     * resulting update to the service's `Y.Doc` with origin `'peer'`.
     */
    function peerTransacts(
      change: (nodesMap: Y.Map<Y.Map<unknown>>, meta: Y.Map<unknown>) => void
    ): void {
      const doc = internals(service).yDoc;
      peer.transact(() => {
        change(peer.getMap('nodes'), peer.getMap('meta'));
      });
      Y.applyUpdate(
        doc,
        Y.encodeStateAsUpdate(peer, Y.encodeStateVector(doc)),
        'peer'
      );
    }

    function undoStackLength(): number | undefined {
      return internals(service).yUndoManager?.undoStack.length;
    }

    function addedIds(): string[] {
      return mmpService.addNodesFromServer.mock.calls.map(
        ([nodes]) => nodes[0].id
      );
    }

    beforeEach(() => {
      mmpService = receivingMmpService();
      service = createService(mmpService);
      service.initMap('test-uuid');
      internals(service).yjsSynced = true;
      internals(service).initUndoManager();
      peer = new Y.Doc();
      peerTransacts(nodesMap =>
        writeNodes(nodesMap, [node('main', null, true)])
      );
      internals(service).setupNodesObserver();
      loadMap = jest
        .spyOn(internals(service), 'loadMapFromYDoc')
        .mockImplementation(() => undefined);
      jest
        .spyOn(internals(service), 'showImportToast')
        .mockResolvedValue(undefined);

      const doc = internals(service).yDoc;
      doc.transact(() => {
        writeNodes(doc.getMap('nodes'), [node('mine', 'main')]);
      }, 'local');
    });

    afterEach(() => {
      service.destroy();
      peer.destroy();
    });

    it('applies a tree a peer adds as an ordinary add and keeps the undo stack', () => {
      peerTransacts(nodesMap => writeNodes(nodesMap, [node('second', null)]));

      expect({
        reloaded: loadMap.mock.calls.length,
        added: addedIds(),
        undoStack: undoStackLength(),
      }).toEqual({ reloaded: 0, added: ['second'], undoStack: 1 });
    });

    it('applies a tree a peer pastes as ordinary adds, parent first, and keeps the undo stack', () => {
      peerTransacts(nodesMap =>
        writeNodes(nodesMap, [
          node('pastedGrandchild', 'pastedChild'),
          node('pastedChild', 'pasted'),
          node('pasted', null),
        ])
      );

      expect({
        reloaded: loadMap.mock.calls.length,
        added: addedIds(),
        undoStack: undoStackLength(),
      }).toEqual({
        reloaded: 0,
        added: ['pasted', 'pastedChild', 'pastedGrandchild'],
        undoStack: 1,
      });
    });

    it('adds every parent before its child when a peer writes two trees at once', () => {
      peerTransacts(nodesMap =>
        writeNodes(nodesMap, [
          node('secondChild', 'second'),
          node('second', null),
          node('thirdChild', 'third'),
          node('third', null),
        ])
      );
      const added = addedIds();

      expect({
        reloaded: loadMap.mock.calls.length,
        secondFirst: added.indexOf('second') < added.indexOf('secondChild'),
        thirdFirst: added.indexOf('third') < added.indexOf('thirdChild'),
        count: added.length,
        undoStack: undoStackLength(),
      }).toEqual({
        reloaded: 0,
        secondFirst: true,
        thirdFirst: true,
        count: 4,
        undoStack: 1,
      });
    });

    it('applies a child a peer adds under the main root and keeps the undo stack', () => {
      peerTransacts(nodesMap =>
        writeNodes(nodesMap, [node('peerChild', 'main')])
      );

      expect({
        reloaded: loadMap.mock.calls.length,
        added: addedIds(),
        undoStack: undoStackLength(),
      }).toEqual({ reloaded: 0, added: ['peerChild'], undoStack: 1 });
    });

    it('adds a subtree a peer pastes under the main root parent first', () => {
      peerTransacts(nodesMap =>
        writeNodes(nodesMap, [
          node('pastedGrandchild', 'pastedChild'),
          node('pastedChild', 'main'),
        ])
      );

      expect({
        reloaded: loadMap.mock.calls.length,
        added: addedIds(),
        undoStack: undoStackLength(),
      }).toEqual({
        reloaded: 0,
        added: ['pastedChild', 'pastedGrandchild'],
        undoStack: 1,
      });
    });

    it('reloads and clears the undo stack when a peer imports a map', () => {
      peerTransacts((nodesMap, meta) => {
        nodesMap.delete('main');
        meta.set('lastMapAnnouncement', 'import');
        writeNodes(nodesMap, [node('imported', null, true)]);
      });

      expect({
        reloaded: loadMap.mock.calls.length,
        undoStack: undoStackLength(),
      }).toEqual({ reloaded: 1, undoStack: 0 });
    });

    it('reloads and clears the undo stack when a peer redistributes a map', () => {
      peerTransacts((nodesMap, meta) => {
        nodesMap.delete('main');
        meta.set('lastMapAnnouncement', 'distribute');
        writeNodes(nodesMap, [node('main', null, true), node('second', null)]);
      });

      expect({
        reloaded: loadMap.mock.calls.length,
        undoStack: undoStackLength(),
      }).toEqual({ reloaded: 1, undoStack: 0 });
    });
  });
});
