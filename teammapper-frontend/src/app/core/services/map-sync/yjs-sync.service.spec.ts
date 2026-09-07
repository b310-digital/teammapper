import { MmpService } from '../mmp/mmp.service';
import { SettingsService } from '../settings/settings.service';
import { UtilsService } from '../utils/utils.service';
import { ToastrService } from 'ngx-toastr';
import { HttpService } from '../../http/http.service';
import { MapSyncContext } from './map-sync-context';
import { YjsSyncService } from './yjs-sync.service';
import * as Y from 'yjs';
import { ExportNodeProperties } from '@mmp/map/types';

function createMockContext(): MapSyncContext {
  return {
    getAttachedMap: jest.fn().mockReturnValue({
      key: 'map-test',
      cachedMap: { uuid: 'test-uuid', data: [] },
    }),
    getModificationSecret: jest.fn().mockReturnValue('secret'),
    getColorMapping: jest.fn().mockReturnValue({}),
    getClientColor: jest.fn().mockReturnValue('#ff0000'),
    colorForNode: jest.fn().mockReturnValue(''),
    setConnectionStatus: jest.fn(),
    setColorMapping: jest.fn(),
    setAttachedNode: jest.fn(),
    setClientColor: jest.fn(),
    setCanUndo: jest.fn(),
    setCanRedo: jest.fn(),
    updateAttachedMap: jest.fn(),
    emitClientList: jest.fn(),
  };
}

function createMockMmpService(): jest.Mocked<MmpService> {
  return {
    on: jest.fn().mockReturnValue({
      subscribe: jest.fn().mockReturnValue({ unsubscribe: jest.fn() }),
    }),
    selectNode: jest.fn(),
    existNode: jest.fn().mockReturnValue(true),
    exportAsJSON: jest.fn().mockReturnValue([]),
  } as unknown as jest.Mocked<MmpService>;
}

function createService(
  mmpService: jest.Mocked<MmpService> = createMockMmpService(),
  context: MapSyncContext = createMockContext()
): YjsSyncService {
  return new YjsSyncService(
    context,
    mmpService,
    {} as SettingsService,
    {} as UtilsService,
    {} as ToastrService,
    {} as HttpService
  );
}

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
  initUndoManager: () => void;
  yUndoManager: Y.UndoManager | null;
}

function internals(service: YjsSyncService): YjsSyncInternals {
  return service as unknown as YjsSyncInternals;
}

describe('YjsSyncService', () => {
  describe('setWritable', () => {
    let service: YjsSyncService;

    beforeEach(() => {
      service = createService();
    });

    it('sets yjsWritable to true', () => {
      service.setWritable(true);

      expect(internals(service).yjsWritable).toBe(true);
    });

    it('sets yjsWritable to false', () => {
      service.setWritable(false);

      expect(internals(service).yjsWritable).toBe(false);
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
    type Handlers = Record<string, (payload?: unknown) => void>;

    const snapshot = [
      { id: 'root', parent: '', isRoot: true },
      { id: 'child', parent: 'root', isRoot: false },
    ] as ExportNodeProperties[];

    let handlers: Handlers;
    let service: YjsSyncService;
    let context: MapSyncContext;

    function capturingMmpService(): jest.Mocked<MmpService> {
      return {
        on: jest.fn((event: string) => ({
          subscribe: (callback: (payload?: unknown) => void) => {
            handlers[event] = callback;
            return { unsubscribe: jest.fn() };
          },
        })),
        selectNode: jest.fn(),
        existNode: jest.fn().mockReturnValue(true),
        exportAsJSON: jest.fn().mockReturnValue(snapshot),
      } as unknown as jest.Mocked<MmpService>;
    }

    beforeEach(() => {
      handlers = {};
      context = createMockContext();
      service = createService(capturingMmpService(), context);
      service.initMap('test-uuid');
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
});
