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
  describe('parseWriteAccessMessage edit mode behavior', () => {
    let service: YjsSyncService;
    let settingsService: jest.Mocked<SettingsService>;

    // Access private members for testing write-access parsing
    interface YjsSyncInternals {
      parseWriteAccessMessage: (e: MessageEvent) => void;
      yjsWritable: boolean;
      yjsSynced: boolean;
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

      settingsService = {
        setEditMode: jest.fn(),
      } as unknown as jest.Mocked<SettingsService>;

      const ctx = createMockContext();

      service = new YjsSyncService(
        ctx,
        mmpService,
        settingsService,
        {} as UtilsService,
        {} as ToastrService,
        {} as HttpService
      );
    });

    function internals(): YjsSyncInternals {
      return service as unknown as YjsSyncInternals;
    }

    it('does not call setEditMode when not yet synced', () => {
      const data = new Uint8Array([4, 1]).buffer;
      const event = new MessageEvent('message', { data });

      internals().parseWriteAccessMessage(event);

      expect(settingsService.setEditMode).not.toHaveBeenCalled();
    });

    it('calls setEditMode when already synced', () => {
      internals().yjsSynced = true;

      const data = new Uint8Array([4, 1]).buffer;
      const event = new MessageEvent('message', { data });

      internals().parseWriteAccessMessage(event);

      expect(settingsService.setEditMode).toHaveBeenCalledWith(true);
    });

    it('does not call setEditMode for read-only when not synced', () => {
      const data = new Uint8Array([4, 0]).buffer;
      const event = new MessageEvent('message', { data });

      internals().parseWriteAccessMessage(event);

      expect(settingsService.setEditMode).not.toHaveBeenCalled();
    });

    it('ignores non-write-access messages', () => {
      const data = new Uint8Array([0, 1]).buffer;
      const event = new MessageEvent('message', { data });

      internals().parseWriteAccessMessage(event);

      expect(settingsService.setEditMode).not.toHaveBeenCalled();
      expect(internals().yjsWritable).toBe(false);
    });
  });
});
