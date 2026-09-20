import { MmpService } from '../../app/core/services/mmp/mmp.service';
import { SettingsService } from '../../app/core/services/settings/settings.service';
import { UtilsService } from '../../app/core/services/utils/utils.service';
import { ToastrService } from 'ngx-toastr';
import { HttpService } from '../../app/core/http/http.service';
import { MapSyncContext } from '../../app/core/services/map-sync/map-sync-context';
import { YjsSyncService } from '../../app/core/services/map-sync/yjs-sync.service';

/**
 * The collaborators YjsSyncService is constructed with. Every suite around the
 * service needs the same three, so they live here instead of in one spec.
 */
export function createMockContext(): MapSyncContext {
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

export function createMockMmpService(): jest.Mocked<MmpService> {
  return {
    on: jest.fn().mockReturnValue({
      subscribe: jest.fn().mockReturnValue({ unsubscribe: jest.fn() }),
    }),
    selectNode: jest.fn(),
    existNode: jest.fn().mockReturnValue(true),
    exportAsJSON: jest.fn().mockReturnValue([]),
  } as unknown as jest.Mocked<MmpService>;
}

export function createYjsSyncService(
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
