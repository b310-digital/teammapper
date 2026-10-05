import { NEVER, Observable } from 'rxjs';
import { MmpService } from '../../app/core/services/mmp/mmp.service';
import { SettingsService } from '../../app/core/services/settings/settings.service';
import { UtilsService } from '../../app/core/services/utils/utils.service';
import { ToastrService } from 'ngx-toastr';
import { MapSyncContext } from '../../app/core/services/map-sync/map-sync-context';
import { YjsSyncService } from '../../app/core/services/map-sync/yjs-sync.service';

/**
 * The collaborators YjsSyncService is constructed with. Every suite around the
 * service needs the same ones, so they live here instead of in one spec.
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
    createMap: jest.fn(),
    mapDeleted: jest.fn(),
  };
}

function createMockMmpService(): jest.Mocked<MmpService> {
  return {
    on: jest.fn().mockReturnValue(NEVER),
    selectNode: jest.fn().mockReturnValue(null),
    existNode: jest.fn().mockReturnValue(true),
  } as unknown as jest.Mocked<MmpService>;
}

/** The mmp callback of each event, by event name. */
export type MmpHandlers = Record<string, (payload?: unknown) => void>;

/**
 * An MmpService whose `on` puts the callback of each event in `handlers`.
 * Like mmp, it keeps one callback per event.
 */
export function capturingMmpService(
  handlers: MmpHandlers
): jest.Mocked<MmpService> {
  return {
    on: jest.fn(
      (event: string) =>
        new Observable<unknown>(observer => {
          handlers[event] = payload => observer.next(payload);
        })
    ),
    selectNode: jest.fn().mockReturnValue(null),
    existNode: jest.fn().mockReturnValue(true),
    highlightNode: jest.fn(),
  } as unknown as jest.Mocked<MmpService>;
}

function createMockSettingsService(): SettingsService {
  return { setEditMode: jest.fn() } as unknown as SettingsService;
}

export function createYjsSyncService(
  mmpService: jest.Mocked<MmpService> = createMockMmpService(),
  context: MapSyncContext = createMockContext(),
  settingsService: SettingsService = createMockSettingsService()
): YjsSyncService {
  return new YjsSyncService(
    context,
    mmpService,
    settingsService,
    {} as UtilsService,
    {} as ToastrService
  );
}
