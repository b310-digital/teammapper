import { MmpService } from '../mmp/mmp.service';
import { SettingsService } from '../settings/settings.service';
import { UtilsService } from '../utils/utils.service';
import { ToastrService } from 'ngx-toastr';
import { HttpService } from '../../http/http.service';
import { MapSyncContext } from './map-sync-context';
import { YjsSyncService } from './yjs-sync.service';

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

describe('YjsSyncService', () => {
  describe('setWritable', () => {
    let service: YjsSyncService;

    interface YjsSyncInternals {
      yjsWritable: boolean;
    }

    beforeEach(() => {
      const mmpService = {
        on: jest.fn().mockReturnValue({
          subscribe: jest.fn().mockReturnValue({ unsubscribe: jest.fn() }),
        }),
        selectNode: jest.fn(),
        existNode: jest.fn().mockReturnValue(true),
        exportAsJSON: jest.fn().mockReturnValue([]),
      } as unknown as jest.Mocked<MmpService>;

      const ctx = createMockContext();

      service = new YjsSyncService(
        ctx,
        mmpService,
        {} as SettingsService,
        {} as UtilsService,
        {} as ToastrService,
        {} as HttpService
      );
    });

    function internals(): YjsSyncInternals {
      return service as unknown as YjsSyncInternals;
    }

    it('sets yjsWritable to true', () => {
      service.setWritable(true);

      expect(internals().yjsWritable).toBe(true);
    });

    it('sets yjsWritable to false', () => {
      service.setWritable(false);

      expect(internals().yjsWritable).toBe(false);
    });
  });

  describe('initMap does not alter writable state', () => {
    let service: YjsSyncService;

    interface YjsSyncInternals {
      yjsWritable: boolean;
      yDoc: unknown;
    }

    beforeEach(() => {
      const mmpService = {
        on: jest.fn().mockReturnValue({
          subscribe: jest.fn().mockReturnValue({ unsubscribe: jest.fn() }),
        }),
        selectNode: jest.fn(),
        existNode: jest.fn().mockReturnValue(true),
        exportAsJSON: jest.fn().mockReturnValue([]),
      } as unknown as jest.Mocked<MmpService>;

      const ctx = createMockContext();

      service = new YjsSyncService(
        ctx,
        mmpService,
        {} as SettingsService,
        {} as UtilsService,
        {} as ToastrService,
        {} as HttpService
      );
    });

    afterEach(() => {
      service.destroy();
    });

    function internals(): YjsSyncInternals {
      return service as unknown as YjsSyncInternals;
    }

    it('does not reset yjsWritable when called', () => {
      service.setWritable(true);
      service.initMap('test-uuid');

      expect(internals().yjsWritable).toBe(true);
    });

    it('creates a new yDoc', () => {
      service.initMap('test-uuid');

      expect(internals().yDoc).not.toBeNull();
    });

    it('retains writable after destroy-setWritable-initMap sequence', () => {
      service.destroy();
      service.setWritable(true);
      service.initMap('test-uuid');

      expect(internals().yjsWritable).toBe(true);
    });
  });
});
