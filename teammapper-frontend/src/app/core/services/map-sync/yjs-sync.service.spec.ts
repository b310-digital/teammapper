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

  describe('initMap preserves writable state', () => {
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

    afterEach(() => {
      service.destroy();
    });

    function internals(): YjsSyncInternals {
      return service as unknown as YjsSyncInternals;
    }

    it('preserves yjsWritable true across initMap', () => {
      service.setWritable(true);
      service.initMap('test-uuid');

      expect(internals().yjsWritable).toBe(true);
    });

    it('preserves yjsWritable false across initMap', () => {
      service.setWritable(false);
      service.initMap('test-uuid');

      expect(internals().yjsWritable).toBe(false);
    });
  });
});
