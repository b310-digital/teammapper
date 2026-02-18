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

function createService(): YjsSyncService {
  return new YjsSyncService(
    createMockContext(),
    createMockMmpService(),
    {} as SettingsService,
    {} as UtilsService,
    {} as ToastrService,
    {} as HttpService
  );
}

interface YjsSyncInternals {
  yjsWritable: boolean;
  yDoc: unknown;
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
});
