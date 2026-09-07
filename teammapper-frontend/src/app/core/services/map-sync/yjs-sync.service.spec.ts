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
        internals(service).yDoc.getMap('meta').get('lastFullMapOperation')
      ).toBe('distribute');
    });

    it('still records an import as an import', () => {
      handlers['create']();

      expect(
        internals(service).yDoc.getMap('meta').get('lastFullMapOperation')
      ).toBe('import');
    });

    it('makes a distribute undoable', () => {
      const doc = internals(service).yDoc;
      const nodesMap = doc.getMap('nodes') as Y.Map<Y.Map<unknown>>;
      // Seed as a local edit so the undo manager has a state to return to.
      doc.transact(() => {
        const yNode = new Y.Map<unknown>();
        nodesMap.set('root', yNode);
        yNode.set('id', 'root');
        yNode.set('isRoot', true);
        yNode.set('coordinates', { x: 5, y: 5 });
      }, 'local');

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

      function replacementEvent(): unknown {
        return {
          changes: { keys: new Map([['root', { action: 'add' }]]) },
          keysChanged: new Set(['root']),
        };
      }

      it('does not show the import toast for a redistribution', () => {
        internals(service)
          .yDoc.getMap('meta')
          .set('lastFullMapOperation', 'distribute');

        internals(service).handleTopLevelNodeChanges(
          replacementEvent(),
          nodesMap
        );

        expect(importToast).not.toHaveBeenCalled();
      });

      it('still shows the import toast for an actual import', () => {
        internals(service)
          .yDoc.getMap('meta')
          .set('lastFullMapOperation', 'import');

        internals(service).handleTopLevelNodeChanges(
          replacementEvent(),
          nodesMap
        );

        expect(importToast).toHaveBeenCalled();
      });
    });
  });
});
